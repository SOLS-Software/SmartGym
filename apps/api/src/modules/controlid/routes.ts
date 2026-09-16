import { z } from 'zod';
import { toBool } from '../../shared/normalize.js';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@smartgym/db';
import { prisma } from '../../shared/prisma.js';
import { assertValidId, optionalNumber } from '../../shared/normalize.js';
import {
  parseControlidPush,
  catracaEmOperacao,
  alertarSePosturaFraca,
  type ControlidDeviceInfo,
  type ControlidNormalizedEvent,
} from './events.js';
import { handleIdentificacaoOnline } from './online.js';
import { enfileirar, proximoComando } from './fila.js';
import {
  cancelarCadastro,
  comandoDeVerificacaoPendente,
  iniciarCadastro,
  processarRespostaDeCadastro,
  sessaoAtiva,
  sessaoDoDevice,
} from './cadastro.js';
import {
  comandoDeLeituraDeUsuarios,
  marcarSyncIniciada,
  reconciliarAcessos,
  syncPendente,
  type UsuarioNoEquipamento,
} from './sincronizacao.js';
import { clientErrorMessage } from '../../shared/errors.js';
import { resolveTenantByDeviceKey } from '../../shared/tenantResolver.js';
import { getTenantDb } from '../../shared/tenantDataSource.js';

type CatracaPayload = {
  idEmpresa?: number | string | null;
  dsCatraca?: string;
  dsFabricante?: string;
  dsModelo?: string;
  caSerial?: string;
  anIp?: string;
  anIpPermitido?: string;
  anMac?: string;
  caToken?: string;
  boInativo?: number;
};

function normalizeCatracaPayload(payload: CatracaPayload) {
  return {
    idEmpresa: optionalNumber(payload.idEmpresa),
    dsCatraca: (payload.dsCatraca ?? '').trim(),
    dsFabricante: (payload.dsFabricante ?? 'controlid').trim(),
    dsModelo: (payload.dsModelo ?? '').trim(),
    caSerial: (payload.caSerial ?? '').trim(),
    anIp: (payload.anIp ?? '').trim(),
    anIpPermitido: (payload.anIpPermitido ?? '').trim(),
    anMac: (payload.anMac ?? '').trim().toUpperCase(),
    caToken: (payload.caToken ?? '').trim(),
    boInativo: toBool(payload.boInativo),
  };
}

// Schemas zod usados APENAS nas rotas de gestao (/controlid/catracas* e
// /controlid/events). As rotas publicas de push/poll das catracas continuam
// com parser tolerante de proposito.
const optionalIdQuery = z.preprocess(
  (value) => (value === undefined || value === null || value === '' ? undefined : value),
  z.coerce.number().int().positive().optional(),
);

const optionalLimitQuery = z.preprocess(
  (value) => (value === undefined || value === null || value === '' ? undefined : value),
  z.coerce.number().int().optional(),
);

const catracasQuerySchema = z.object({
  includeInactive: z.string().optional(),
  idEmpresa: optionalIdQuery,
  limit: optionalLimitQuery,
});

const eventsQuerySchema = z.object({
  idCatraca: optionalIdQuery,
  idAluno: optionalIdQuery,
  onlyGranted: z.string().optional(),
  limit: optionalLimitQuery,
});

const catracaTextField = z
  .string({ invalid_type_error: 'Dados invalidos.' })
  .trim()
  .max(200, 'O campo deve ter no maximo 200 caracteres.')
  .nullish();

const catracaBodySchema = z.object({
  idEmpresa: z.preprocess(
    (value) => (value === undefined || value === null || value === '' || value === 0 ? undefined : value),
    z.coerce
      .number({ invalid_type_error: 'Empresa invalida.' })
      .int('Empresa invalida.')
      .positive('Empresa invalida.')
      .optional(),
  ),
  dsCatraca: catracaTextField,
  dsFabricante: catracaTextField,
  dsModelo: catracaTextField,
  caSerial: catracaTextField,
  anIp: catracaTextField,
  anIpPermitido: catracaTextField,
  anMac: catracaTextField,
  caToken: catracaTextField,
  boInativo: z.preprocess((value) => toBool(value), z.boolean()),
});

// IP de origem do device. Usa SEMPRE request.ip, que o Fastify deriva do
// X-Forwarded-For respeitando o numero de proxies confiaveis configurado em
// app.ts (trustProxy). Ler o header cru aqui, como era feito antes, entregava a
// escrita de `anIpOrigem`/`Catraca.anIp` ao cliente: bastava mandar
// `X-Forwarded-For: 10.0.0.1` para forjar a origem dos eventos de acesso e
// contaminar a trilha de auditoria da catraca.
function getClientIp(request: FastifyRequest): string {
  return request.ip ?? '';
}

// Extrai o token do device enviado no push. Aceitamos duas formas para cobrir
// diferentes firmwares/configuracoes de campo:
//   1) header `x-controlid-token` (forma primaria, ja lida pelo handler antigo);
//   2) campo `token` / `push_token` no corpo JSON (fallback para firmwares que
//      nao permitem header customizado).
// Retorna string vazia quando nenhum token e enviado.
// Autenticacao do equipamento por IP de origem.
//
// As rotas de device sao publicas (o firmware nao manda JWT) e a defesa
// prevista, `caToken`, e inalcancavel neste firmware: a tela de push so tem
// endereco do servidor e periodo, sem campo de token. Entao, quando o operador
// preenche `anIpPermitido`, passamos a exigir que a requisicao venha daquele IP.
// Vazio = sem restricao (equipamento ainda em provisionamento).
export function ipDoDeviceAutorizado(
  catraca: { anIpPermitido?: string | null } | null,
  clientIp: string,
): boolean {
  const permitido = (catraca?.anIpPermitido ?? '').trim();
  if (!permitido) return true;
  return permitido === clientIp.trim();
}

function extractControlidToken(request: FastifyRequest): string {
  const headerToken = request.headers['x-controlid-token'];
  if (typeof headerToken === 'string' && headerToken.trim() !== '') {
    return headerToken.trim();
  }
  const body = request.body;
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const record = body as Record<string, unknown>;
    const bodyToken = record.token ?? record.push_token ?? record.pushToken;
    if (typeof bodyToken === 'string' && bodyToken.trim() !== '') {
      return bodyToken.trim();
    }
    if (typeof bodyToken === 'number' || typeof bodyToken === 'bigint') {
      return String(bodyToken);
    }
  }
  return '';
}

// Teto de catracas auto-registradas AGUARDANDO reivindicacao (idEmpresa null).
// As rotas de push/poll sao publicas por necessidade (o firmware nao manda JWT),
// e cada serial/deviceId novo criava uma linha em tb_Catracas — ou seja, um
// anonimo com um laco `for` enchia a tabela e poluia o painel de todos os
// tenants indefinidamente. Com o teto, o provisionamento normal (poucos
// equipamentos por vez, reivindicados no painel) continua funcionando e o abuso
// para de crescer. Ajustavel por CONTROLID_MAX_PENDING_DEVICES.
const MAX_PENDING_AUTOREGISTERED = Number(process.env.CONTROLID_MAX_PENDING_DEVICES ?? 50);

// Intervalo minimo entre dois comandos `load_objects` para o MESMO device.
//
// O modo push da Control iD manda o equipamento executar o comando e voltar
// imediatamente para pedir o proximo. Como a resposta do polling sempre trazia
// um comando, o device entrava em loop fechado: medimos ~25 requisicoes por
// SEGUNDO de um unico equipamento, o suficiente para estourar o rate limit
// (429) e manter a API ocupada a toa. A doc e explicita: "quando nao houver
// nada a fazer, o servidor deve enviar uma resposta vazia" — ai o equipamento
// espera o proprio push_request_period antes de perguntar de novo.
const COMMAND_INTERVAL_MS = Number(process.env.CONTROLID_COMMAND_INTERVAL_MS ?? 5_000);

// Ultimo instante em que entregamos um comando a cada device. Em memoria de
// proposito: e so um regulador de trafego, e perder o estado no restart custa
// no maximo um comando extra.
//
// Marcado com performance.now() (relogio MONOTONICO), nunca com Date.now().
// Visto em campo: o NTP corrigiu o relogio da maquina 9 minutos PARA TRAS e,
// como a marca anterior tinha ficado "no futuro", `agora - ultimo` virou
// negativo, a condicao nunca mais foi satisfeita e a API parou de pedir eventos
// as catracas — silenciosamente, com o equipamento seguindo o polling normal.
// Ajuste de horario de verao, sincronizacao de NTP ou acerto manual no servidor
// causariam a mesma parada. O relogio monotonico nao anda para tras.
const lastCommandByDevice = new Map<string, number>();

function shouldIssueCommand(deviceId: string): boolean {
  const interval = Number.isFinite(COMMAND_INTERVAL_MS) && COMMAND_INTERVAL_MS >= 0
    ? COMMAND_INTERVAL_MS
    : 5_000;
  const now = performance.now();
  const last = lastCommandByDevice.get(deviceId);
  if (last !== undefined && now - last < interval) return false;
  lastCommandByDevice.set(deviceId, now);
  return true;
}

// -------------------------------------------------------------------
// Bootstrap do modo online.
//
// Os parametros que ligam o modo online (`general.online`,
// `general.local_identification`) NAO existem no menu do equipamento: so via
// set_configuration da API. Como a catraca ja nos pergunta o que fazer a cada
// ciclo de push, entregamos a configuracao por esse mesmo canal em vez de
// depender de acesso manual ao aparelho.
//
// Dispara UMA vez por serial listado em CONTROLID_BOOTSTRAP_MODO_ONLINE
// (separados por virgula) e some — nao fica reenviando a cada ciclo. Feito por
// env de proposito: reconfigurar equipamento e operacao pontual e deliberada,
// nao algo que deva ficar exposto numa rota generica de "execute este comando
// na catraca".
// Doc: https://www.controlid.com.br/docs/access-api-pt/modos-de-operacao/configurar-modo-online/
// FILA de comandos por serial, e nao um comando so: o set_configuration da
// Control iD e atomico e o firmware varia entre modelos. Na primeira tentativa
// aqui, um unico parametro inexistente (`ihm_enterprise_mode`) fez o
// equipamento recusar o pacote inteiro. Em fila, cada passo e pequeno e o erro
// aponta o culpado, em vez de derrubar tudo junto.
const bootstrapPendente = new Map<string, Record<string, unknown>[]>();

for (const serial of (process.env.CONTROLID_BOOTSTRAP_MODO_ONLINE ?? '')
  .split(',')
  .map((valor) => valor.trim())
  .filter((valor) => valor !== '')) {
  bootstrapPendente.set(serial, []);
}

// O destino das requisicoes ONLINE vive na secao `online_client` e NAO herda o
// servidor configurado para o push — sao dois canais independentes. Se ficar
// sem preencher, a catraca entra em modo online e passa a perguntar para o
// endereco default dela, que nao e a nossa API: toda identificacao daria
// timeout e cairia na regra local.
const ONLINE_HOST = (process.env.CONTROLID_ONLINE_HOST ?? '').trim();
const ONLINE_PORT = (process.env.CONTROLID_ONLINE_PORT ?? process.env.API_PORT ?? '3333').trim();
// Sem barra inicial: o equipamento monta <host>:<port>/<path>/new_user_identified.fcgi.
const ONLINE_PATH = (process.env.CONTROLID_ONLINE_PATH ?? 'controlid').trim().replace(/^\/+|\/+$/g, '');

function comando(endpoint: string, body: Record<string, unknown>) {
  return { verb: 'POST', endpoint, contentType: 'application/json', queryString: '', body };
}

// Passo 1: descobrir o que ESTE firmware realmente tem. A resposta volta em
// /result e sai no log, e so entao montamos o set_configuration com os nomes
// que existem de fato.
//
// O get_configuration exige a LISTA de parametros desejados — secao com array
// vazio devolve objeto vazio (foi o que aconteceu na primeira tentativa). Uma
// secao por comando: se um nome nao existir, o erro identifica o culpado sem
// derrubar a consulta da outra secao junto.
function comandosDeDiagnostico() {
  return [
    comando('get_configuration', { general: ['online', 'local_identification'] }),
    comando('get_configuration', {
      online_client: ['hostname', 'port', 'path', 'request_timeout'],
    }),
  ];
}

// Sonda nomes candidatos no modulo online_client, um por comando. Parametro
// inexistente responde com erro nomeando o caminho ("param[name=X]"), entao
// cada tentativa e informativa: ou devolve o valor, ou confirma que o nome nao
// existe neste firmware. E a unica forma de mapear o modulo — o
// get_configuration com lista vazia devolve objeto vazio, sem enumerar nada.
function comandosDeSondagem() {
  const candidatos = [
    'enabled',
    'online',
    'server_type',
    'port',
    'path',
    'host',
    'ip',
    'server',
    'url',
    'device_id',
    'timeout',
    'server_port',
  ];
  return candidatos.map((nome) => comando('get_configuration', { online_client: [nome] }));
}

// Mapeamento do modelo de permissao do equipamento (Plano B: em vez de esperar
// a catraca perguntar, mantemos nela a informacao de quem pode entrar).
//
// No modelo da Control iD o usuario ganha acesso por uma tabela de juncao
// (user_access_rules) que o liga a uma regra; a regra, por sua vez, vale em
// determinados horarios e portais. Bloquear um aluno inadimplente deve ser
// remover essa ligacao — NUNCA apagar o usuario, que levaria a digital junto e
// obrigaria a recadastrar quando ele quitasse.
function comandosDeObjetos() {
  return [
    comando('load_objects', { object: 'users' }),
    comando('load_objects', { object: 'access_rules' }),
    comando('load_objects', { object: 'user_access_rules' }),
    comando('load_objects', { object: 'time_zones' }),
    comando('load_objects', { object: 'portals' }),
    comando('load_objects', { object: 'portal_access_rules' }),
    comando('load_objects', { object: 'groups' }),
    comando('load_objects', { object: 'user_groups' }),
  ];
}

// Identificacao do equipamento (modelo e versao de firmware). As divergencias
// encontradas entre a doc publica e este aparelho sao provavelmente especificas
// de versao, e sem o numero nao da para consultar a referencia certa. Nomes de
// endpoint candidatos, um por comando: o que nao existir responde com erro e os
// demais seguem.
function comandosDeIdentificacao() {
  return [
    comando('system_information', {}),
    comando('get_system_information', {}),
    comando('device_info', {}),
    comando('get_configuration', { general: ['device_name', 'model', 'firmware_version'] }),
    comando('get_configuration', { general: ['model'] }),
    comando('get_configuration', { general: ['firmware_version'] }),
  ];
}

// Unica divergencia restante entre o que a doc do modo online prescreve e o que
// este equipamento tem gravado: extract_template. A doc pede "0" (o equipamento
// ja identificou localmente, nao precisa extrair template para mandar ao
// servidor); a catraca veio com "1".
function comandosDeAjuste() {
  return [comando('set_configuration', { online_client: { extract_template: '0' } })];
}

// Le de volta o que ficou gravado depois da ativacao. Um parametro por comando:
// o get_configuration tambem e atomico e um nome inexistente derruba a consulta
// inteira, escondendo os que existem.
function comandosDeVerificacao() {
  return [
    comando('get_configuration', { online_client: ['server_id'] }),
    comando('get_configuration', { general: ['online', 'local_identification'] }),
    comando('get_configuration', { online_client: ['request_timeout'] }),
    comando('get_configuration', { online_client: ['max_request_attempts'] }),
    comando('get_configuration', { online_client: ['extract_template'] }),
  ];
}

// Passo 2: ativar. Fatiado em dois set_configuration para que a secao `general`
// (o que liga o modo online) nao seja perdida caso algum parametro de
// `online_client` nao exista neste firmware.
// Endereco COMPLETO da nossa API como a catraca precisa enxergar. Vai inteiro
// no campo `ip` do objeto `devices` — nao existe campo separado de porta ou
// caminho nesse objeto.
const ONLINE_SERVER_URL = (
  process.env.CONTROLID_ONLINE_SERVER_URL ??
  `http://${ONLINE_HOST}:${ONLINE_PORT}${ONLINE_PATH ? `/${ONLINE_PATH}` : ''}`
).trim();

// O destino das requisicoes online NAO e um parametro de endereco: e uma
// referencia. Primeiro cria-se um objeto `devices` representando o servidor,
// depois aponta-se `online_client.server_id` para o id retornado. Como o id so
// existe depois da criacao, a sequencia e encadeada pelas RESPOSTAS do
// equipamento (ver processarRespostaDeBootstrap), nao por uma lista fixa.
// Doc: https://www.controlid.com.br/docs/access-api-pt/modos-de-operacao/configurar-modo-online/
function comandosDeAtivacao() {
  return [
    // Antes de criar, olha o que ja existe: repetir o bootstrap nao pode
    // encher o equipamento de servidores duplicados.
    comando('load_objects', { object: 'devices' }),
  ];
}

const BOOTSTRAP_MODE = (process.env.CONTROLID_BOOTSTRAP_ETAPA ?? 'diagnostico').trim();

// Devices cuja sequencia ja comecou — impede recomecar do zero a cada ciclo
// enquanto esperamos a proxima resposta do equipamento.
const bootstrapIniciado = new Set<string>();

function enfileirarBootstrap(deviceId: string, ...comandos: Record<string, unknown>[]) {
  const fila = bootstrapPendente.get(deviceId);
  if (!fila) return;
  fila.push(...comandos);
}

function comandoDeBootstrap(deviceId: string) {
  const fila = bootstrapPendente.get(deviceId);
  if (!fila) return null;

  if (fila.length === 0 && !bootstrapIniciado.has(deviceId)) {
    bootstrapIniciado.add(deviceId);
    if (BOOTSTRAP_MODE === 'ativar') {
      if (!ONLINE_HOST) return null;
      fila.push(...comandosDeAtivacao());
    } else if (BOOTSTRAP_MODE === 'verificar') {
      fila.push(...comandosDeVerificacao());
    } else if (BOOTSTRAP_MODE === 'objetos') {
      fila.push(...comandosDeObjetos());
    } else if (BOOTSTRAP_MODE === 'identificar') {
      fila.push(...comandosDeIdentificacao());
    } else if (BOOTSTRAP_MODE === 'ajustar') {
      fila.push(...comandosDeAjuste());
    } else if (BOOTSTRAP_MODE === 'sondar') {
      fila.push(...comandosDeSondagem());
    } else {
      fila.push(...comandosDeDiagnostico());
    }
  }

  // Fila vazia com sequencia ja iniciada: aguardando a resposta do equipamento
  // para decidir o proximo passo. Segue o fluxo normal de coleta de log.
  return fila.shift() ?? null;
}

// Segundo passo da reconciliacao: chegou a lista de usuarios do equipamento,
// entao comparamos com a situacao dos alunos e enfileiramos so as diferencas.
async function processarRespostaDeSincronizacao(
  request: FastifyRequest,
  deviceId: string,
  endpoint: string,
  body: Record<string, unknown>,
) {
  if (endpoint !== 'load_objects') return;
  const resposta = respostaDoResult(body);
  const usuarios = resposta?.users;
  if (!Array.isArray(usuarios)) return;

  const catraca = await request.tenantDb.catraca.findFirst({
    where: { caSerial: deviceId },
    select: { id: true },
  });
  if (!catraca) return;

  const resultado = await reconciliarAcessos(request.tenantDb, {
    idCatraca: catraca.id,
    deviceId,
    usuarios: usuarios as UsuarioNoEquipamento[],
  });

  // So registra quando houve mudanca — em regime, a reconciliacao e silenciosa.
  if (resultado.liberados > 0 || resultado.bloqueados > 0 || resultado.bloqueadosSemVinculo > 0) {
    request.log.warn(
      { deviceId, ...resultado },
      'Sincronizacao de acesso: enviando alteracoes para a catraca.',
    );
  } else {
    request.log.info({ deviceId, ...resultado }, 'Sincronizacao de acesso: nada a alterar.');
  }
}

function respostaDoResult(body: Record<string, unknown>): Record<string, unknown> | null {
  const bruto = body.response;
  if (!bruto) return null;
  if (typeof bruto === 'string') {
    try {
      const parsed: unknown = JSON.parse(bruto);
      return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  return typeof bruto === 'object' && !Array.isArray(bruto) ? (bruto as Record<string, unknown>) : null;
}

// Maquina de estados do bootstrap, dirigida pelas respostas da catraca:
//   load_objects(devices) -> reusa o servidor existente OU cria um novo
//   create_objects        -> pega o id criado
//   set_configuration     -> conclui
function processarRespostaDeBootstrap(
  request: FastifyRequest,
  deviceId: string,
  endpoint: string,
  body: Record<string, unknown>,
) {
  if (!bootstrapPendente.has(deviceId)) return;

  const resposta = respostaDoResult(body);

  if (endpoint === 'load_objects' && resposta && Array.isArray(resposta.devices)) {
    const servidores = resposta.devices as Record<string, unknown>[];
    const existente = servidores.find((servidor) => String(servidor.ip ?? '') === ONLINE_SERVER_URL);

    if (existente?.id !== undefined) {
      request.log.warn(
        { deviceId, serverId: existente.id, url: ONLINE_SERVER_URL },
        'Bootstrap: servidor online ja cadastrado na catraca — apenas referenciando.',
      );
      enfileirarBootstrap(
        deviceId,
        comando('set_configuration', { online_client: { server_id: String(existente.id) } }),
      );
      return;
    }

    request.log.warn(
      { deviceId, url: ONLINE_SERVER_URL, jaCadastrados: servidores.length },
      'Bootstrap: criando o servidor online na catraca.',
    );
    enfileirarBootstrap(
      deviceId,
      comando('create_objects', {
        object: 'devices',
        values: [{ name: 'SmartGym', ip: ONLINE_SERVER_URL, public_key: '' }],
      }),
    );
    return;
  }

  if (endpoint === 'create_objects' && resposta && Array.isArray(resposta.ids)) {
    const idCriado = (resposta.ids as unknown[])[0];
    if (idCriado === undefined || idCriado === null) return;
    request.log.warn({ deviceId, serverId: idCriado }, 'Bootstrap: servidor criado, referenciando.');
    enfileirarBootstrap(
      deviceId,
      comando('set_configuration', { online_client: { server_id: String(idCriado) } }),
    );
    return;
  }

  if (endpoint === 'set_configuration') {
    request.log.warn(
      { deviceId },
      'Bootstrap CONCLUIDO: catraca apontada para a nossa API no modo online.',
    );
    bootstrapPendente.delete(deviceId);
  }
}

async function canAutoRegister(db: PrismaClient): Promise<boolean> {
  const limit = Number.isFinite(MAX_PENDING_AUTOREGISTERED) && MAX_PENDING_AUTOREGISTERED > 0
    ? MAX_PENDING_AUTOREGISTERED
    : 50;
  const pending = await db.catraca.count({ where: { idEmpresa: null } });
  return pending < limit;
}

// Localiza (ou cria) o registro da catraca usando o serial / MAC enviado no push.
// Se o equipamento ainda nao estiver cadastrado, criamos um registro inativo
// para o gestor visualizar e ativar manualmente no painel.
async function findOrAutoRegisterCatraca(db: PrismaClient, device: ControlidDeviceInfo, clientIp: string) {
  const caSerial = device.caSerial;
  const anMac = device.anMac.toUpperCase();

  const where: { caSerial?: string; anMac?: string }[] = [];
  if (caSerial) where.push({ caSerial });
  if (anMac) where.push({ anMac });

  if (where.length === 0) {
    return null;
  }

  const existing = await db.catraca.findFirst({ where: { OR: where } });
  if (existing) return existing;

  if (!(await canAutoRegister(db))) return null;

  return db.catraca.create({
    data: {
      dsCatraca: device.dsModelo || 'Catraca Control iD',
      dsFabricante: 'controlid',
      dsModelo: device.dsModelo,
      caSerial,
      anMac,
      anIp: clientIp,
      boInativo: true, // aguardando ativacao manual no painel
    },
  });
}

// NOTA: existia aqui um `resolveAlunoId(nrUsuarioCatraca)` que traduzia o
// user_id da catraca para Aluno.id. Nunca foi chamado — persistEvents grava
// apenas `nrUsuarioCatraca` cru — e, como fazia `aluno.findUnique` por id sem
// nenhum filtro de tenant, seria um vazamento cross-tenant esperando o primeiro
// uso. Removido: quando o vinculo evento->aluno for implementado, a busca
// precisa ser escopada pelo cliente da empresa dona da catraca.

export async function registerControlidRoutes(app: FastifyInstance) {
  // Hook de diagnostico: loga TODA requisicao que a catraca eventualmente mandar
  // em paths fora do esperado (ex.: POST / quando o usuario configurou a URL sem caminho).
  // Util enquanto estamos validando a integracao - depois pode ser removido.
  app.addHook('onRequest', async (request) => {
    if (request.url.startsWith('/controlid')) return;
    const userAgent = String(request.headers['user-agent'] ?? '');
    const looksLikeControlid =
      userAgent.toLowerCase().includes('controlid') ||
      String(request.headers['x-controlid-token'] ?? '') !== '' ||
      // Padrao comum: catraca manda do IP 192.168.1.x onde foi configurada.
      false;
    if (looksLikeControlid) {
      // NUNCA logar `request.headers` inteiro aqui. A condicao acima e
      // controlada pelo cliente (basta mandar `x-controlid-token: x` ou um
      // User-Agent com "controlid"), entao qualquer usuario autenticado
      // conseguia forcar o despejo dos proprios headers no log — incluindo
      // `authorization: Bearer <JWT>` e `cookie: smartgym_token=...`. Um JWT
      // valido em texto claro no armazenamento de logs e credencial vazada
      // (OWASP A09). Registramos so o que serve ao diagnostico da integracao.
      request.log.warn(
        {
          method: request.method,
          url: request.url,
          ip: request.ip,
          ua: userAgent,
          hasControlidToken: String(request.headers['x-controlid-token'] ?? '') !== '',
          contentType: request.headers['content-type'],
        },
        'Possivel requisicao da catraca chegando em path NAO esperado.',
      );
    }
  });

  // Rate limit das rotas PUBLICAS da catraca (push/poll). Sao os unicos
  // endpoints nao autenticados que ESCREVEM no banco (eventos + auto-registro),
  // entao merecem teto proprio, mais generoso que o de auth (uma catraca faz
  // polling a cada poucos segundos) e bem abaixo do limite global de 300/min.
  const deviceRateLimit = { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } };

  // Catch-all: aceita POST em qualquer rota /controlid/* para nao perder evento
  // caso a URL configurada na catraca esteja sem o /push.
  app.post('/controlid', deviceRateLimit, async (request, reply) => {
    request.log.warn(
      { ip: request.ip },
      'POST em /controlid sem /push - tratando como push mesmo assim. Considere ajustar a URL na catraca.',
    );
    return handleControlidPushRequest(request, reply);
  });

  // -------------------------------------------------------------------
  // "Modo Push" da Control iD - na verdade e um POLLING reverso:
  //
  // 1) A catraca faz GET /push?deviceId=X&uuid=Y a cada N segundos perguntando
  //    se o servidor tem comandos a executar (cadastrar usuario, sincronizar,
  //    etc.). Devolvemos um JSON com a lista de comandos pendentes (ou vazio).
  //
  // 2) Quando a catraca tem eventos a reportar OU termina de executar comandos,
  //    ela faz POST /push com o resultado/eventos.
  //
  // IMPORTANTE: a Control iD anexa "/push" automaticamente na URL que voce
  // digita na tela do equipamento. Portanto a URL configurada deve ser:
  //   http://<host-da-api>:<porta>/controlid
  // (NAO inclua o "/push" no fim - se incluir, vira /push/push e dah 404).
  // -------------------------------------------------------------------
  app.get<{
    Querystring: { deviceId?: string; uuid?: string };
  }>('/controlid/push', deviceRateLimit, async (request, reply) => {
    return handleControlidPollRequest(request, reply);
  });

  app.post('/controlid/push', deviceRateLimit, async (request, reply) => {
    return handleControlidPushRequest(request, reply);
  });

  // Alguns firmwares anexam /push tambem em GET. Cobertura defensiva.
  app.get<{
    Querystring: { deviceId?: string; uuid?: string };
  }>('/controlid/push/push', deviceRateLimit, async (request, reply) => {
    return handleControlidPollRequest(request, reply);
  });
  app.post('/controlid/push/push', deviceRateLimit, async (request, reply) => {
    return handleControlidPushRequest(request, reply);
  });

  // Retorno do comando entregue no polling. O equipamento monta a URL como
  // <servidor-configurado>/result, entao com "/controlid" configurado na catraca
  // ele bate exatamente aqui.
  app.post<{ Querystring: { deviceId?: string; uuid?: string } }>(
    '/controlid/result',
    deviceRateLimit,
    async (request, reply) => {
      return handleControlidResultRequest(request, reply);
    },
  );
  app.post<{ Querystring: { deviceId?: string; uuid?: string } }>(
    '/controlid/push/result',
    deviceRateLimit,
    async (request, reply) => {
      return handleControlidResultRequest(request, reply);
    },
  );

  // -------------------------------------------------------------------
  // Modo de identificacao ONLINE (ver ./online.ts). A catraca pergunta antes
  // de liberar; quem decide e o SmartGym, pela regra de plano/pagamento.
  //
  // Rate limit proprio e mais folgado: aqui cada requisicao e uma PESSOA na
  // porta esperando a catraca destravar. Se o limite estourar, o equipamento
  // nao recebe resposta e a fila para — o oposto do que o teto protege nas
  // rotas de coleta de log.
  // -------------------------------------------------------------------
  const onlineRateLimit = { config: { rateLimit: { max: 600, timeWindow: '1 minute' } } };

  app.post('/controlid/new_user_identified.fcgi', onlineRateLimit, async (request, reply) => {
    return handleIdentificacaoOnline(request, reply, extractControlidToken);
  });

  // Mesmo endpoint na RAIZ. O caminho das requisicoes online vem de
  // `online_client.path`, que pode estar vazio no equipamento; nesse caso ele
  // posta em /new_user_identified.fcgi. Responder nos dois lugares evita perder
  // a primeira identificacao por um detalhe de configuracao — e uma pessoa
  // parada na catraca esperando.
  app.post('/new_user_identified.fcgi', onlineRateLimit, async (request, reply) => {
    return handleIdentificacaoOnline(request, reply, extractControlidToken);
  });

  // Identificacao por cartao: o vinculo cartao->aluno ainda nao existe no
  // sistema, entao respondemos negado com motivo claro em vez de deixar o
  // equipamento sem resposta (que o faria cair na regra local dele).
  app.post('/controlid/new_card.fcgi', onlineRateLimit, async (request, reply) => {
    request.log.warn(
      { ip: request.ip },
      'Identificacao por cartao recebida, mas o vinculo cartao->aluno nao esta implementado.',
    );
    return reply.code(200).send({ result: { event: 6, user_id: 0, portal_id: 1 } });
  });

  // Botoeira de saida (request to exit): nao ha o que decidir, so registrar.
  app.post('/controlid/new_rex_log.fcgi', onlineRateLimit, async (request, reply) => {
    request.log.info({ ip: request.ip }, 'Acionamento de botoeira recebido.');
    return reply.code(200).send({ result: { event: 11, portal_id: 1 } });
  });

  // Endpoint para o equipamento testar conectividade.
  app.get('/controlid/health', deviceRateLimit, async () => ({ ok: true, ts: new Date().toISOString() }));

  // -------------------------------------------------------------------
  // ENDERECO POR ACADEMIA: as mesmas rotas acima, sob /d/<chave>.
  //
  // As rotas /controlid/* nao dizem de QUEM e o equipamento — descobrem pelo
  // `caSerial`, que mora em tb_Catracas (aplicacao). Com banco por cliente isso
  // e ovo-e-galinha: para procurar o serial seria preciso ja saber o tenant.
  //
  // O firmware nao deixa mandar token, mas deixa configurar o ENDERECO do
  // servidor — e ANEXA o proprio endpoint ao caminho digitado (e por isso que
  // /controlid, /controlid/push e /controlid/push/push existem: sao tres bases
  // vistas em campo). Entao o caminho carrega a chave da academia, resolvida no
  // control-plane ANTES de abrir qualquer banco de aplicacao.
  //
  // Configurar no equipamento:  https://<api>/d/<caChaveDispositivo>
  // (sem barra no fim e sem /push — o firmware anexa).
  //
  // As rotas antigas seguem valendo e caem no pool compartilhado: nada quebra
  // para quem ja esta em campo. Reapontar so e OBRIGATORIO antes de siloar um
  // cliente — ver o runbook em docs/multi-tenancy-dados.md.
  // -------------------------------------------------------------------

  // Resolve o tenant pela chave e deixa o banco dele no request. Sem chave
  // valida nao ha o que fazer: 404 generico, igual ao webhook de pagamento —
  // dizer "essa chave nao existe" ajudaria quem esta varrendo.
  async function comTenantDaChave(request: FastifyRequest, reply: FastifyReply) {
    const { chave } = request.params as { chave?: string };
    const idCliente = await resolveTenantByDeviceKey(chave);
    if (!idCliente) {
      request.log.warn({ ip: request.ip }, 'Dispositivo com chave de endereco desconhecida.');
      return reply.code(404).send({ message: 'Endereco invalido.' });
    }
    request.tenantId = idCliente;
    request.tenantDb = await getTenantDb(idCliente);
  }

  const comChave = { ...deviceRateLimit, preHandler: comTenantDaChave };
  const comChaveOnline = { ...onlineRateLimit, preHandler: comTenantDaChave };

  type ParamsChave = { Params: { chave: string } };

  // Base sem sufixo (equipamento que nao anexa nada).
  app.post<ParamsChave>('/d/:chave', comChave, async (request, reply) =>
    handleControlidPushRequest(request, reply),
  );

  // Push / poll.
  app.get<ParamsChave & { Querystring: { deviceId?: string; uuid?: string } }>(
    '/d/:chave/push',
    comChave,
    async (request, reply) => handleControlidPollRequest(request, reply),
  );
  app.post<ParamsChave>('/d/:chave/push', comChave, async (request, reply) =>
    handleControlidPushRequest(request, reply),
  );
  app.get<ParamsChave & { Querystring: { deviceId?: string; uuid?: string } }>(
    '/d/:chave/push/push',
    comChave,
    async (request, reply) => handleControlidPollRequest(request, reply),
  );
  app.post<ParamsChave>('/d/:chave/push/push', comChave, async (request, reply) =>
    handleControlidPushRequest(request, reply),
  );

  // Retorno dos comandos entregues no poll.
  app.post<ParamsChave & { Querystring: { deviceId?: string; uuid?: string } }>(
    '/d/:chave/result',
    comChave,
    async (request, reply) => handleControlidResultRequest(request, reply),
  );
  app.post<ParamsChave & { Querystring: { deviceId?: string; uuid?: string } }>(
    '/d/:chave/push/result',
    comChave,
    async (request, reply) => handleControlidResultRequest(request, reply),
  );

  // Modo online: a catraca pergunta antes de liberar a passagem.
  app.post<ParamsChave>('/d/:chave/new_user_identified.fcgi', comChaveOnline, async (request, reply) =>
    handleIdentificacaoOnline(request, reply, extractControlidToken),
  );
  app.post<ParamsChave>('/d/:chave/new_card.fcgi', comChaveOnline, async (request, reply) => {
    request.log.warn(
      { ip: request.ip },
      'Identificacao por cartao recebida, mas o vinculo cartao->aluno nao esta implementado.',
    );
    return reply.code(200).send({ result: { event: 6, user_id: 0, portal_id: 1 } });
  });
  app.post<ParamsChave>('/d/:chave/new_rex_log.fcgi', comChaveOnline, async (request, reply) => {
    request.log.info({ ip: request.ip }, 'Acionamento de botoeira recebido.');
    return reply.code(200).send({ result: { event: 11, portal_id: 1 } });
  });

  app.get<ParamsChave>('/d/:chave/health', comChave, async () => ({
    ok: true,
    ts: new Date().toISOString(),
  }));

  // -------------------------------------------------------------------
  // CRUD basico das catracas cadastradas.
  // -------------------------------------------------------------------
  app.get<{ Querystring: { includeInactive?: string; idEmpresa?: string } }>(
    '/controlid/catracas',
    async (request, reply) => {
      const idCliente = request.user.idCliente;
      if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
      const parsedQuery = catracasQuerySchema.safeParse(request.query ?? {});
      if (!parsedQuery.success) {
        return reply.code(400).send({ message: 'Parametros invalidos.' });
      }
      const includeInactive = parsedQuery.data.includeInactive === 'true';
      const idEmpresa = parsedQuery.data.idEmpresa ?? null;
      const take = Math.min(Math.max(parsedQuery.data.limit ?? 1000, 1), 1000);
      // Janela para considerar a catraca "viva". O equipamento faz polling a
      // cada poucos segundos; alguns minutos sem contato ja indicam problema.
      // Nao havia NENHUMA forma de perceber que a integracao parou — aconteceu
      // duas vezes durante a implantacao e so foi notado porque alguem estava
      // olhando o log. Com o acesso sincronizado, uma parada silenciosa vai
      // barrando aluno conforme as validades expiram.
      const limiteOnline = Number(process.env.CONTROLID_ONLINE_TIMEOUT_MS ?? 120_000);
      const catracas = await request.tenantDb.catraca.findMany({
        where: {
          ...(includeInactive ? {} : { boInativo: false }),
          // Catracas auto-registradas chegam sem idEmpresa e precisam aparecer
          // no painel para o gestor ativar/vincular.
          // RISCO RESIDUAL (aceito): catracas com idEmpresa null ficam visiveis
          // a TODOS os tenants ate serem reclamadas - proposital para o fluxo de
          // ativacao, mas significa que um tenant pode enxergar serial/MAC/IP de
          // um equipamento auto-registrado que sera de outro tenant. A MUTACAO /
          // claim dessas catracas e protegida no PUT/PATCH abaixo (somente o
          // proprio tenant consegue assumi-las e edita-las).
          ...(idEmpresa
            ? { idEmpresa, empresa: { idCliente } }
            : { OR: [{ idEmpresa: null }, { empresa: { idCliente } }] }),
        },
        orderBy: { dtCadastro: 'desc' },
        take,
      });

      const agora = Date.now();
      const janela = Number.isFinite(limiteOnline) && limiteOnline > 0 ? limiteOnline : 120_000;
      return catracas.map((catraca) => ({
        ...catraca,
        boOnline:
          catraca.dtUltimoPush !== null && agora - catraca.dtUltimoPush.getTime() <= janela,
        nrSegundosSemContato:
          catraca.dtUltimoPush === null
            ? null
            : Math.round((agora - catraca.dtUltimoPush.getTime()) / 1000),
      }));
    },
  );

  // Endereco que a academia digita no equipamento. Existe pelo mesmo motivo do
  // endereco do webhook em paymentAccounts: e um valor que alguem precisa
  // COPIAR para um painel de terceiro, e digitar errado significa semanas sem
  // evento chegando. Melhor o servidor montar do que o operador adivinhar.
  app.get('/controlid/endereco', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });

    const cliente = await prisma.cliente.findUnique({
      where: { id: idCliente },
      select: { caChaveDispositivo: true },
    });
    const chave = cliente?.caChaveDispositivo ?? null;
    const base = (process.env.API_PUBLIC_URL ?? '').trim().replace(/\/+$/, '') || null;

    return {
      chave,
      // Caminho relativo: serve mesmo sem API_PUBLIC_URL configurada.
      caminho: chave ? `/d/${chave}` : null,
      // O que se digita na tela do equipamento. SEM barra no fim e SEM /push:
      // o firmware anexa o proprio endpoint ao que estiver aqui.
      endereco: base && chave ? `${base}/d/${chave}` : null,
      // Enquanto o cliente nao tem chave, o caminho antigo segue valendo (cai
      // no pool compartilhado) — e o que mantem o parque atual funcionando.
      enderecoLegado: base ? `${base}/controlid` : null,
    };
  });

  app.post<{ Body: CatracaPayload }>('/controlid/catracas', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const parsedBody = catracaBodySchema.safeParse(request.body ?? {});
      if (!parsedBody.success) {
        throw new Error(parsedBody.error.issues[0]?.message ?? 'Dados invalidos.');
      }
      const data = normalizeCatracaPayload(request.body);
      if (data.idEmpresa) {
        const empresa = await request.tenantDb.empresa.findFirst({
          where: { id: data.idEmpresa, idCliente },
          select: { id: true },
        });
        if (!empresa) throw new Error('Empresa nao pertence ao cliente.');
      }
      const created = await request.tenantDb.catraca.create({ data });
      return reply.code(201).send(created);
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao cadastrar catraca.'),
      });
    }
  });

  app.put<{ Params: { id: string }; Body: CatracaPayload }>(
    '/controlid/catracas/:id',
    async (request, reply) => {
      const idCliente = request.user.idCliente;
      if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
      try {
        const id = Number(request.params.id);
        assertValidId(id, 'Catraca invalida.');
        // Carregamos a catraca com o vinculo empresa->cliente para aplicar a
        // regra anti-sequestro cross-tenant (objetivo "b").
        const existing = await request.tenantDb.catraca.findUnique({
          where: { id },
          select: { id: true, idEmpresa: true, empresa: { select: { idCliente: true } } },
        });
        // Uma catraca ja reclamada por OUTRO tenant nunca deve ser mutavel aqui:
        // so seguimos se ela for do proprio tenant OU ainda estiver sem empresa
        // (idEmpresa null, aguardando reivindicacao).
        if (!existing || (existing.idEmpresa !== null && existing.empresa?.idCliente !== idCliente)) {
          return reply.code(404).send({ message: 'Registro nao encontrado.' });
        }
        const parsedBody = catracaBodySchema.safeParse(request.body ?? {});
        if (!parsedBody.success) {
          throw new Error(parsedBody.error.issues[0]?.message ?? 'Dados invalidos.');
        }
        const data = normalizeCatracaPayload(request.body);
        // Reivindicacao (claim) de catraca ainda nao vinculada: so permitimos a
        // mutacao se ela ATRIBUIR a catraca a uma empresa do proprio tenant.
        // Isso impede que o tenant A apenas renomeie/reconfigure uma catraca
        // nula (que pode, de fato, ser o equipamento auto-registrado do tenant B)
        // sem assumi-la de verdade.
        if (existing.idEmpresa === null && !data.idEmpresa) {
          throw new Error('Para editar uma catraca ainda nao vinculada, informe a empresa do seu cliente.');
        }
        if (data.idEmpresa) {
          const empresa = await request.tenantDb.empresa.findFirst({
            where: { id: data.idEmpresa, idCliente },
            select: { id: true },
          });
          if (!empresa) throw new Error('Empresa nao pertence ao cliente.');
        }
        return request.tenantDb.catraca.update({ where: { id }, data });
      } catch (error) {
        return reply.code(400).send({
          message: clientErrorMessage(error, 'Erro ao atualizar catraca.'),
        });
      }
    },
  );

  app.patch<{ Params: { id: string }; Body: { boInativo?: number } }>(
    '/controlid/catracas/:id/status',
    async (request, reply) => {
      const idCliente = request.user.idCliente;
      if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
      try {
        const id = Number(request.params.id);
        assertValidId(id, 'Catraca invalida.');
        // O PATCH de status nao carrega idEmpresa, entao nao ha como "reivindicar"
        // uma catraca por aqui. Restringimos a catracas que JA pertencem ao
        // proprio tenant, para que o tenant A nao consiga ativar/desativar
        // catracas de outro tenant NEM catracas ainda nao reclamadas. A
        // reivindicacao/ativacao inicial de uma catraca nula deve ser feita via
        // PUT /controlid/catracas/:id, atribuindo a empresa do proprio cliente.
        const existing = await request.tenantDb.catraca.findFirst({
          where: { id, empresa: { idCliente } },
          select: { id: true },
        });
        if (!existing) return reply.code(404).send({ message: 'Registro nao encontrado.' });
        return request.tenantDb.catraca.update({
          where: { id },
          data: { boInativo: toBool(request.body.boInativo) },
        });
      } catch (error) {
        return reply.code(400).send({
          message: clientErrorMessage(error, 'Erro ao alterar status da catraca.'),
        });
      }
    },
  );

  // Catracas ATIVAS que pararam de falar com a API.
  //
  // Endpoint proprio, enxuto e barato, porque e consultado em intervalo curto
  // pelo painel de todo funcionario logado — a listagem completa devolveria
  // serial, IP e token de todos os equipamentos a cada ciclo, sem necessidade.
  //
  // Silencio de catraca nao e falha inofensiva: com o acesso sincronizado, uma
  // parada vai barrando aluno conforme as validades expiram, e sem aviso a
  // academia so descobre pela fila na porta. Aconteceu duas vezes na implantacao
  // e so foi notado porque alguem olhava o log do servidor.
  app.get('/controlid/alertas', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });

    const limite = Number(process.env.CONTROLID_ONLINE_TIMEOUT_MS ?? 120_000);
    const janela = Number.isFinite(limite) && limite > 0 ? limite : 120_000;
    const desde = new Date(Date.now() - janela);

    const offline = await request.tenantDb.catraca.findMany({
      where: {
        // Catraca inativa esta desligada de proposito: nao alerta.
        boInativo: false,
        empresa: { idCliente },
        OR: [{ dtUltimoPush: null }, { dtUltimoPush: { lt: desde } }],
      },
      select: { id: true, dsCatraca: true, caSerial: true, dtUltimoPush: true },
      orderBy: { dtUltimoPush: 'desc' },
      take: 20,
    });

    const agora = Date.now();
    return {
      qtOffline: offline.length,
      catracas: offline.map((catraca) => ({
        id: catraca.id,
        dsCatraca: catraca.dsCatraca,
        caSerial: catraca.caSerial,
        dtUltimoPush: catraca.dtUltimoPush,
        nrSegundosSemContato:
          catraca.dtUltimoPush === null
            ? null
            : Math.round((agora - catraca.dtUltimoPush.getTime()) / 1000),
      })),
    };
  });

  // Numeros de usuario que a catraca ja reportou e que NAO estao vinculados a
  // nenhum aluno. E a lista que a tela de vinculo precisa: o operador cadastra a
  // digital no equipamento, o numero aparece aqui no primeiro acesso, e ele so
  // escolhe de quem e. Sem isso o vinculo depende de alguem ler o id na tela da
  // catraca e digitar certo.
  app.get('/controlid/usuarios-nao-vinculados', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });

    const eventos = await request.tenantDb.catracaEvento.groupBy({
      by: ['nrUsuarioCatraca'],
      where: {
        idAluno: null,
        nrUsuarioCatraca: { not: null },
        // "0" e o que o equipamento manda quando NAO identificou ninguem — nao
        // e um usuario, e a ausencia de um.
        NOT: { nrUsuarioCatraca: '0' },
        catraca: { empresa: { idCliente } },
      },
      _count: { _all: true },
      _max: { dtEvento: true },
      orderBy: { _max: { dtEvento: 'desc' } },
      take: 100,
    });

    return eventos.map((evento) => ({
      nrUsuarioCatraca: evento.nrUsuarioCatraca,
      qtEventos: evento._count._all,
      dtUltimoEvento: evento._max.dtEvento,
    }));
  });

  // -------------------------------------------------------------------
  // Cadastro de digital pelo painel.
  // -------------------------------------------------------------------
  //
  // Por que isso funciona sem app desktop e sem estar na rede da catraca: o
  // canal de push e um RPC para DENTRO do equipamento (ver cadastro.ts). Quem
  // dispara o enrolamento e o servidor, de onde quer que ele esteja; a unica
  // presenca fisica necessaria e a do dedo no leitor.

  // Catraca elegivel para receber comandos. Cada recusa aqui evita um cadastro
  // que ficaria "carregando" ate o timeout: fila e por serial, equipamento sem
  // contato nunca vem buscar o comando, e catraca sem empresa nao tem escopo de
  // aluno nenhum.
  async function catracaParaComando(db: PrismaClient, idCatraca: number, idCliente: number) {
    const catraca = await db.catraca.findFirst({
      where: { id: idCatraca, empresa: { idCliente } },
      select: { id: true, dsCatraca: true, caSerial: true, boInativo: true, dtUltimoPush: true },
    });
    if (!catraca) {
      throw new Error('Catraca nao encontrada ou ainda nao vinculada a uma empresa do seu cliente.');
    }
    const serial = catraca.caSerial.trim();
    if (!serial) {
      throw new Error('Catraca sem numero de serie: nao ha como enderecar comandos a ela.');
    }
    return { ...catraca, caSerial: serial };
  }

  function catracaEstaViva(dtUltimoPush: Date | null): boolean {
    const limite = Number(process.env.CONTROLID_ONLINE_TIMEOUT_MS ?? 120_000);
    const janela = Number.isFinite(limite) && limite > 0 ? limite : 120_000;
    return dtUltimoPush !== null && Date.now() - dtUltimoPush.getTime() <= janela;
  }

  const cadastroDigitalBodySchema = z.object({
    idCatraca: z.coerce.number({ invalid_type_error: 'Catraca invalida.' }).int().positive('Catraca invalida.'),
    idAluno: z.coerce.number({ invalid_type_error: 'Aluno invalido.' }).int().positive('Aluno invalido.'),
  });

  const cadastroDigitalQuerySchema = z.object({
    idCatraca: z.coerce.number({ invalid_type_error: 'Catraca invalida.' }).int().positive('Catraca invalida.'),
  });

  app.post<{ Body: { idCatraca?: number | string; idAluno?: number | string } }>(
    '/controlid/cadastro-digital',
    async (request, reply) => {
      const idCliente = request.user.idCliente;
      if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
      try {
        const parsed = cadastroDigitalBodySchema.safeParse(request.body ?? {});
        if (!parsed.success) {
          throw new Error(parsed.error.issues[0]?.message ?? 'Dados invalidos.');
        }
        const { idCatraca, idAluno } = parsed.data;

        const catraca = await catracaParaComando(request.tenantDb, idCatraca, idCliente);
        if (catraca.boInativo) {
          throw new Error('Catraca inativa. Ative o equipamento no painel antes de cadastrar digitais.');
        }
        if (!catracaEstaViva(catraca.dtUltimoPush)) {
          throw new Error(
            'A catraca esta sem contato com o sistema. O comando so seria entregue quando ela voltar — verifique o equipamento e tente de novo.',
          );
        }
        // Reconfiguracao de modo online em andamento neste equipamento. Os dois
        // fluxos criam objetos na catraca e o /result nao diz QUAL objeto o
        // `ids` da resposta pertence: rodar juntos trocaria o id do servidor
        // pelo id do usuario e vincularia o aluno a um numero que nao existe.
        if (bootstrapPendente.has(catraca.caSerial)) {
          throw new Error(
            'Esta catraca esta em reconfiguracao (bootstrap do modo online). Aguarde terminar antes de cadastrar digitais.',
          );
        }
        if (sessaoAtiva(catraca.caSerial)) {
          return reply.code(409).send({
            message: 'Ja existe um cadastro de digital em andamento nesta catraca.',
            sessao: sessaoDoDevice(catraca.caSerial),
          });
        }

        const aluno = await request.tenantDb.aluno.findFirst({
          where: { id: idAluno, idCliente, boInativo: false },
          select: { id: true, nmAluno: true, nrUsuarioCatraca: true },
        });
        if (!aluno) return reply.code(404).send({ message: 'Aluno nao encontrado.' });

        const sessao = iniciarCadastro({
          deviceId: catraca.caSerial,
          idCatraca: catraca.id,
          idAluno: aluno.id,
          nmAluno: aluno.nmAluno,
          nrUsuarioCatraca: aluno.nrUsuarioCatraca,
        });

        request.log.warn(
          {
            deviceId: catraca.caSerial,
            idCatraca: catraca.id,
            idAluno: aluno.id,
            nrUsuarioCatraca: aluno.nrUsuarioCatraca,
          },
          'Cadastro de digital iniciado pelo painel.',
        );

        return reply.code(202).send(sessao);
      } catch (error) {
        return reply.code(400).send({
          message: clientErrorMessage(error, 'Erro ao iniciar o cadastro de digital.'),
        });
      }
    },
  );

  // Estado da sessao. A tela consulta em intervalo curto enquanto a pessoa esta
  // com o dedo no leitor — por isso devolve so a sessao, sem tocar no banco
  // alem da conferencia de posse da catraca.
  app.get<{ Querystring: { idCatraca?: string } }>(
    '/controlid/cadastro-digital',
    async (request, reply) => {
      const idCliente = request.user.idCliente;
      if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
      try {
        const parsed = cadastroDigitalQuerySchema.safeParse(request.query ?? {});
        if (!parsed.success) {
          throw new Error(parsed.error.issues[0]?.message ?? 'Parametros invalidos.');
        }
        const catraca = await catracaParaComando(request.tenantDb, parsed.data.idCatraca, idCliente);
        return { sessao: sessaoDoDevice(catraca.caSerial) };
      } catch (error) {
        return reply.code(400).send({
          message: clientErrorMessage(error, 'Erro ao consultar o cadastro de digital.'),
        });
      }
    },
  );

  app.delete<{ Querystring: { idCatraca?: string } }>(
    '/controlid/cadastro-digital',
    async (request, reply) => {
      const idCliente = request.user.idCliente;
      if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
      try {
        const parsed = cadastroDigitalQuerySchema.safeParse(request.query ?? {});
        if (!parsed.success) {
          throw new Error(parsed.error.issues[0]?.message ?? 'Parametros invalidos.');
        }
        const catraca = await catracaParaComando(request.tenantDb, parsed.data.idCatraca, idCliente);
        return { sessao: cancelarCadastro(catraca.caSerial) };
      } catch (error) {
        return reply.code(400).send({
          message: clientErrorMessage(error, 'Erro ao cancelar o cadastro de digital.'),
        });
      }
    },
  );

  // -------------------------------------------------------------------
  // Consulta de eventos recebidos.
  // -------------------------------------------------------------------
  app.get<{
    Querystring: {
      idCatraca?: string;
      idAluno?: string;
      onlyGranted?: string;
      limit?: string;
    };
  }>('/controlid/events', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    const parsedQuery = eventsQuerySchema.safeParse(request.query ?? {});
    if (!parsedQuery.success) {
      return reply.code(400).send({ message: 'Parametros invalidos.' });
    }
    const idCatraca = parsedQuery.data.idCatraca ?? null;
    const idAluno = parsedQuery.data.idAluno ?? null;
    const onlyGranted = parsedQuery.data.onlyGranted === 'true';
    const limit = Math.min(Math.max(parsedQuery.data.limit ?? 100, 1), 500);

    return request.tenantDb.catracaEvento.findMany({
      where: {
        ...(idCatraca ? { idCatraca } : {}),
        // O filtro por aluno era aceito na query e descartado: quem pedisse
        // ?idAluno=3 recebia os eventos de TODO mundo. Agora que o evento
        // guarda o aluno resolvido, o filtro finalmente funciona — escopado
        // pelo cliente logo abaixo, como os demais.
        ...(idAluno ? { idAluno, aluno: { idCliente } } : {}),
        ...(onlyGranted ? { boAcessoLiberado: true } : {}),
        // Mesma regra da listagem de catracas: eventos de catracas ainda nao
        // vinculadas (idEmpresa null) ficam visiveis a todos os tenants ate a
        // reivindicacao. RISCO RESIDUAL aceito para o fluxo de ativacao; catracas
        // ja reclamadas por outro tenant continuam filtradas por empresa.idCliente,
        // entao nenhum evento de aluno de outro tenant vaza aqui.
        catraca: { OR: [{ idEmpresa: null }, { empresa: { idCliente } }] },
      },
      // O nome do aluno vem junto: a tela de acessos precisa dizer "Gustavo
      // entrou", nao "usuario 1000013 entrou". Sem isso o front teria que buscar
      // aluno por aluno.
      include: { aluno: { select: { id: true, nmAluno: true } } },
      orderBy: { dtEvento: 'desc' },
      take: limit,
    });
  });
}

// Trata o GET periodico que a catraca faz pedindo comandos.
// A cada COMMAND_INTERVAL_MS devolvemos um comando `load_objects` pedindo os
// access_logs novos (id > ultimo que ja gravamos); nos ciclos intermediarios a
// resposta e vazia. A catraca executa o comando contra a propria API local e
// POSTa o resultado em /controlid/result.
async function handleControlidPollRequest(
  request: FastifyRequest<{ Querystring: { deviceId?: string; uuid?: string } }>,
  reply: FastifyReply,
) {
  const clientIp = getClientIp(request);
  const deviceId = (request.query.deviceId ?? '').trim();
  const uuid = (request.query.uuid ?? '').trim();

  request.log.debug(
    { url: request.url, ip: clientIp, deviceId, uuid },
    'Polling da Control iD recebido (GET).',
  );

  // Sem deviceId nao ha como saber de quem sao os eventos: responde vazio.
  if (!deviceId) {
    return reply.code(200).send({});
  }

  // Origem nao autorizada nao recebe comando: a fila carrega a sincronizacao de
  // acesso, que expoe numeros de usuario da catraca.
  const cadastrada = await request.tenantDb.catraca.findFirst({
    where: { caSerial: deviceId },
    select: { anIpPermitido: true },
  });
  if (!ipDoDeviceAutorizado(cadastrada, clientIp)) {
    request.log.warn(
      { deviceId, ip: clientIp },
      'Polling recusado: origem diferente do IP permitido da catraca.',
    );
    return reply.code(403).send({ ok: false, error: 'ip_nao_autorizado' });
  }

  // Comando ja enfileirado (sincronizacao de acesso) tem prioridade sobre a
  // coleta de log: manter a catraca sabendo quem pode entrar vale mais do que
  // buscar o historico alguns segundos antes.
  const pendente = proximoComando(deviceId);
  if (pendente) {
    return reply.code(200).send(pendente);
  }

  // Cadastro de digital em andamento: a confirmacao (contagem de digitais do
  // usuario) vem antes da reconciliacao periodica. Ha alguem parado na frente do
  // equipamento esperando a tela dizer "pronto" — cinco minutos de fila atras de
  // uma sincronizacao de rotina seria a diferenca entre confirmar e desistir.
  const verificacaoDeCadastro = comandoDeVerificacaoPendente(deviceId);
  if (verificacaoDeCadastro) {
    return reply.code(200).send(verificacaoDeCadastro);
  }

  // Hora de reconciliar? Pede a lista de usuarios do equipamento; a comparacao
  // acontece quando a resposta chegar em /result.
  if (syncPendente(deviceId)) {
    marcarSyncIniciada(deviceId);
    request.log.info({ deviceId }, 'Sincronizacao de acesso: lendo usuarios do equipamento.');
    return reply.code(200).send(comandoDeLeituraDeUsuarios());
  }

  // Configuracao pendente tem prioridade sobre a coleta de log e ignora o
  // regulador de trafego: e uma unica entrega.
  const bootstrap = comandoDeBootstrap(deviceId);
  if (bootstrap) {
    request.log.warn(
      { deviceId, ip: clientIp },
      'Entregando set_configuration para ativar o MODO ONLINE na catraca.',
    );
    return reply.code(200).send(bootstrap);
  }

  // Nada a fazer neste ciclo -> resposta vazia (ver COMMAND_INTERVAL_MS).
  if (!shouldIssueCommand(deviceId)) {
    return reply.code(200).send({});
  }

  // Localiza ou auto-registra a catraca usando o deviceId enviado.
  let catraca = null;
  if (deviceId) {
    catraca = await request.tenantDb.catraca.findFirst({ where: { caSerial: deviceId } });
    if (!catraca) {
      // Mesmo teto do push: rota publica nao pode criar linhas sem limite.
      if (await canAutoRegister(request.tenantDb)) {
        catraca = await request.tenantDb.catraca.create({
          data: {
            dsCatraca: 'Catraca Control iD',
            dsFabricante: 'controlid',
            dsModelo: '',
            caSerial: deviceId,
            anIp: clientIp,
            boInativo: true,
          },
        });
        request.log.info(
          { idCatraca: catraca.id, deviceId, ip: clientIp },
          'Catraca auto-registrada (inativa, aguardando ativacao no painel).',
        );
      } else {
        request.log.warn(
          { deviceId, ip: clientIp },
          'Auto-registro recusado: limite de catracas pendentes atingido (CONTROLID_MAX_PENDING_DEVICES). Reivindique/remova as pendentes no painel.',
        );
      }
    }
    if (catraca) {
      await request.tenantDb.catraca.update({
        where: { id: catraca.id },
        data: { dtUltimoPush: new Date(), anIp: clientIp || catraca.anIp },
      });
    }
  }

  // Descobre o ultimo evento ja recebido dessa catraca para pedir apenas
  // os mais novos (id > ultimo). Se nunca recebemos nada, pede tudo (id > 0).
  let lastEventId = 0;
  if (catraca) {
    const last = await request.tenantDb.catracaEvento.findFirst({
      where: { idCatraca: catraca.id },
      orderBy: { idEventoDispositivo: 'desc' },
      select: { idEventoDispositivo: true },
    });
    if (last?.idEventoDispositivo !== null && last?.idEventoDispositivo !== undefined) {
      // BigInt -> Number (aceitavel pois IDs cabem em Number.MAX_SAFE_INTEGER).
      lastEventId = Number(last.idEventoDispositivo);
    }
  }

  // Formato do comando de push documentado pela Control iD: UM objeto JSON com
  // os campos verb/endpoint/body/contentType/queryString (resposta vazia = nada
  // a fazer). O equipamento executa esse comando contra a propria API local e
  // devolve o resultado em POST /result.
  //
  // O que existia aqui era um ARRAY de comandos num formato inventado
  // (`{id, type: 'load', object, where: {access_logs: {id: ['>', n]}}, limit}`).
  // O firmware nao reconhece esse envelope: ele lia a resposta, nao achava
  // `endpoint`, e simplesmente nao executava nada — por isso a catraca fazia o
  // polling normalmente (dtUltimoPush atualizava) mas NUNCA devolvia um evento
  // sequer. `where` tambem segue a sintaxe real do load_objects: lista de
  // {object, field, operator, value}.
  // Doc: https://www.controlid.com.br/docs/access-api-pt/modo-push/introducao-ao-push/
  const command = {
    verb: 'POST',
    endpoint: 'load_objects',
    contentType: 'application/json',
    queryString: '',
    body: {
      object: 'access_logs',
      where: [
        {
          object: 'access_logs',
          field: 'id',
          operator: '>',
          value: lastEventId,
        },
      ],
      limit: 100,
    },
  };

  request.log.info(
    { deviceId, uuid, lastEventId },
    'Polling: pedindo access_logs novos a catraca (load_objects).',
  );

  return reply.code(200).send(command);
}

// POST /controlid/result?deviceId=X — o equipamento devolve AQUI o resultado do
// comando entregue no polling. Esta rota simplesmente nao existia: a catraca
// executava o comando (quando o formato batia) e postava o resultado num 404.
// Corpo documentado: { uuid, endpoint, response } — ou { uuid, endpoint, error }
// quando o comando falhou no equipamento.
async function handleControlidResultRequest(
  request: FastifyRequest<{ Querystring: { deviceId?: string; uuid?: string; endpoint?: string } }>,
  reply: FastifyReply,
) {
  const clientIp = getClientIp(request);
  const deviceId = (request.query.deviceId ?? '').trim();
  // O equipamento informa qual comando executou na QUERY STRING
  // (?endpoint=load_objects), nao no corpo — o corpo traz so `response`/`error`.
  const endpointExecutado =
    (request.query.endpoint ?? '').trim() ||
    (typeof (request.body as Record<string, unknown> | null)?.endpoint === 'string'
      ? String((request.body as Record<string, unknown>).endpoint)
      : '');
  const body = (typeof request.body === 'object' && request.body !== null
    ? request.body
    : {}) as Record<string, unknown>;

  // O corpo do /result carrega a resposta da API local da catraca (incluindo
  // get_configuration). So vai para o log com CONTROLID_DEBUG_BODY ligado: em
  // operacao normal esse corpo traz identificacao de pessoa, que e PII.
  if (process.env.CONTROLID_DEBUG_BODY === 'true') {
    request.log.info(
      { deviceId, endpoint: endpointExecutado, corpo: body },
      'Result da Control iD: corpo cru (debug).',
    );
  }

  processarRespostaDeBootstrap(request, deviceId, endpointExecutado, body);
  await processarRespostaDeSincronizacao(request, deviceId, endpointExecutado, body);

  const deviceError = typeof body.error === 'string' ? body.error : '';

  // O cadastro de digital precisa enxergar TAMBEM as respostas de erro: "este
  // endpoint nao existe neste firmware" e a informacao mais importante que a
  // sessao pode receber, e o retorno antecipado logo abaixo a descartaria,
  // deixando o operador olhando uma tela girando ate o timeout.
  const sessaoDeCadastro = await processarRespostaDeCadastro(
    request.tenantDb,
    deviceId,
    endpointExecutado,
    respostaDoResult(body),
    deviceError,
  );
  if (sessaoDeCadastro) {
    request.log.info(
      {
        deviceId,
        endpoint: endpointExecutado,
        etapa: sessaoDeCadastro.etapa,
        idAluno: sessaoDeCadastro.idAluno,
        nrUsuarioCatraca: sessaoDeCadastro.nrUsuarioCatraca,
      },
      'Cadastro de digital: sessao avancou.',
    );
  }

  if (deviceError) {
    request.log.warn(
      { deviceId, ip: clientIp, endpoint: endpointExecutado, error: deviceError },
      'Catraca respondeu o comando de push com erro.',
    );
    return reply.code(200).send({ ok: true });
  }

  const catraca = deviceId ? await request.tenantDb.catraca.findFirst({ where: { caSerial: deviceId } }) : null;

  if (!ipDoDeviceAutorizado(catraca, clientIp)) {
    request.log.warn(
      { deviceId, ip: clientIp },
      'Result recusado: origem diferente do IP permitido da catraca.',
    );
    return reply.code(403).send({ ok: false, error: 'ip_nao_autorizado' });
  }

  // Mesma regra de token do /push: se a catraca ja tem token provisionado, o
  // resultado precisa vir autenticado, senao qualquer um injeta "eventos de
  // acesso" na trilha de auditoria.
  const expectedToken = (catraca?.caToken ?? '').trim();
  if (expectedToken) {
    if (extractControlidToken(request) !== expectedToken) {
      request.log.warn({ deviceId, ip: clientIp }, 'Result da Control iD recusado: token invalido.');
      return reply.code(401).send({ ok: false, error: 'token_invalido' });
    }
  } else if (process.env.CONTROLID_REQUIRE_TOKEN === 'true') {
    request.log.warn({ deviceId, ip: clientIp }, 'Result da Control iD recusado: token requerido.');
    return reply.code(401).send({ ok: false, error: 'token_requerido' });
  }

  const { events } = parseControlidPush(body);

  request.log.info(
    {
      deviceId,
      ip: clientIp,
      idCatraca: catraca?.id ?? null,
      endpoint: endpointExecutado,
      recebidos: events.length,
    },
    'Result da Control iD recebido.',
  );

  if (!catraca) {
    request.log.warn(
      { deviceId, ip: clientIp },
      'Result recebido de deviceId sem catraca cadastrada — eventos descartados.',
    );
    return reply.code(200).send({ ok: true, received: events.length, persisted: 0 });
  }

  await request.tenantDb.catraca.update({
    where: { id: catraca.id },
    data: { dtUltimoPush: new Date(), anIp: clientIp || catraca.anIp },
  });

  // Catraca ainda nao ativada (sem unidade ou inativa): atualizamos o "ultimo
  // contato" acima para o gestor ve-la e reivindica-la, mas os eventos NAO
  // entram na trilha. Ver catracaEmOperacao.
  if (!catracaEmOperacao(catraca)) {
    request.log.warn(
      { deviceId, ip: clientIp, idCatraca: catraca.id, idEmpresa: catraca.idEmpresa },
      'Result de catraca nao ativada (sem unidade ou inativa) — eventos descartados.',
    );
    return reply.code(200).send({ ok: true, received: events.length, persisted: 0 });
  }

  alertarSePosturaFraca(catraca, clientIp, request.log);

  const persisted = await persistEvents(request.tenantDb, {
    events,
    idCatraca: catraca.id,
    anIpOrigem: clientIp,
  });

  return reply.code(200).send({ ok: true, received: events.length, persisted });
}

async function handleControlidPushRequest(request: FastifyRequest, reply: FastifyReply) {
  const clientIp = getClientIp(request);

  // Log de diagnostico. O CORPO so vai para o log quando CONTROLID_DEBUG_BODY
  // estiver ligado explicitamente: o push carrega identificacao de pessoa
  // (numero de usuario, cartao, biometria reportada) e nao deve ir parar no
  // armazenamento de logs por padrao — e PII sob a LGPD, retida por tempo
  // indeterminado e visivel a quem tem acesso aos logs, nao ao sistema.
  request.log.info(
    {
      url: request.url,
      ip: clientIp,
      contentType: request.headers['content-type'],
      bodyType: typeof request.body,
      ...(process.env.CONTROLID_DEBUG_BODY === 'true' ? { body: request.body } : {}),
    },
    'Push da Control iD: requisicao recebida.',
  );

  try {
    const { device, events } = parseControlidPush(request.body);

    const catraca = await findOrAutoRegisterCatraca(request.tenantDb, device, clientIp);

    // -------------------------------------------------------------------
    // Validacao de token do device (anti-forja de eventos - objetivo "a").
    //
    // Executada ANTES de qualquer escrita (atualizacao de metadata da catraca
    // OU persistencia de eventos), para que um push forjado nao consiga sequer
    // sobrescrever `anIp`/`dtUltimoPush` de uma catraca legitima.
    //
    // Regras:
    //  - Se a catraca resolvida tem `caToken` configurado, o push DEVE trazer
    //    exatamente esse token (header `x-controlid-token` OU campo `token` /
    //    `push_token` no body). Se nao bater, rejeitamos com 401.
    //  - Se `caToken` esta vazio (catraca auto-registrada aguardando ativacao
    //    manual no painel), mantemos o comportamento atual (aceita sem token)
    //    para NAO quebrar catracas legitimas ainda em provisionamento.
    //  - A flag de ambiente CONTROLID_REQUIRE_TOKEN (default desligada) permite
    //    endurecer: quando === 'true', QUALQUER push de catraca sem `caToken`
    //    configurado (ou com device nao identificado) e rejeitado - bloqueio
    //    total para deploys ja 100% provisionados com token.
    //
    // O corpo da resposta segue o mesmo formato ({ ok: false, error }) que os
    // demais caminhos deste handler ja devolvem para a catraca.
    if (!ipDoDeviceAutorizado(catraca, clientIp)) {
      request.log.warn(
        { serial: device.caSerial, idCatraca: catraca?.id, ip: clientIp },
        'Push recusado: origem diferente do IP permitido da catraca.',
      );
      return reply.code(403).send({ ok: false, error: 'ip_nao_autorizado' });
    }

    const requireTokenGlobally = process.env.CONTROLID_REQUIRE_TOKEN === 'true';
    const expectedToken = (catraca?.caToken ?? '').trim();
    if (expectedToken) {
      const providedToken = extractControlidToken(request);
      if (providedToken !== expectedToken) {
        request.log.warn(
          { serial: device.caSerial, idCatraca: catraca?.id, ip: clientIp },
          'Push da Control iD recusado: token do device invalido ou ausente.',
        );
        return reply.code(401).send({ ok: false, error: 'token_invalido' });
      }
    } else if (requireTokenGlobally) {
      request.log.warn(
        { serial: device.caSerial, idCatraca: catraca?.id, ip: clientIp },
        'Push da Control iD recusado: CONTROLID_REQUIRE_TOKEN ativo e catraca sem caToken configurado.',
      );
      return reply.code(401).send({ ok: false, error: 'token_requerido' });
    }

    if (catraca) {
      await request.tenantDb.catraca.update({
        where: { id: catraca.id },
        data: {
          dtUltimoPush: new Date(),
          anIp: clientIp || catraca.anIp,
          ...(catraca.dsModelo ? {} : { dsModelo: device.dsModelo }),
        },
      });
    }

    if (events.length === 0) {
      return reply.code(200).send({ ok: true, received: 0 });
    }

    // Catraca inexistente/nao ativada (sem unidade ou inativa): metadata ja foi
    // atualizada acima (para o painel), mas os eventos NAO entram na trilha.
    // Fecha o auto-registro-e-despejo por rota publica. Ver catracaEmOperacao.
    if (!catracaEmOperacao(catraca)) {
      request.log.warn(
        {
          serial: device.caSerial,
          ip: clientIp,
          idCatraca: catraca?.id ?? null,
          idEmpresa: catraca?.idEmpresa ?? null,
          descartados: events.length,
        },
        'Push de catraca nao ativada (sem unidade, inativa ou nao cadastrada) — eventos descartados.',
      );
      return reply.code(200).send({ ok: true, received: events.length, persisted: 0 });
    }

    alertarSePosturaFraca(catraca, clientIp, request.log);

    const created = await persistEvents(request.tenantDb, {
      events,
      idCatraca: catraca.id,
      anIpOrigem: clientIp,
    });

    request.log.info(
      {
        serial: device.caSerial,
        mac: device.anMac,
        idCatraca: catraca?.id,
        received: events.length,
        persisted: created,
      },
      'Push da Control iD: eventos persistidos.',
    );

    return reply.code(200).send({ ok: true, received: events.length, persisted: created });
  } catch (error) {
    request.log.error(
      { err: error, ip: clientIp },
      'Falha ao processar push da Control iD.',
    );
    return reply.code(200).send({ ok: false });
  }
}

// Traduz os `user_id` reportados pela catraca em alunos do SmartGym.
//
// A busca e SEMPRE escopada pelo cliente dono da catraca (catraca -> empresa ->
// cliente). Era exatamente esse escopo que faltava no `resolveAlunoId` removido
// daqui: uma busca por id solta permitiria que o evento de uma catraca do
// cliente A apontasse para um aluno do cliente B. Catraca ainda nao vinculada a
// uma empresa (idEmpresa null) nao resolve ninguem — sem dono, sem escopo.
async function resolveAlunosPorUsuarioCatraca(db: PrismaClient, idCatraca: number,
  numerosUsuario: string[],): Promise<Map<string, number>> {
  const mapa = new Map<string, number>();

  const numeros = [...new Set(numerosUsuario)]
    .map((valor) => Number(valor))
    .filter((valor) => Number.isInteger(valor) && valor > 0);
  if (numeros.length === 0) return mapa;

  const catraca = await db.catraca.findUnique({
    where: { id: idCatraca },
    select: { empresa: { select: { idCliente: true } } },
  });
  const idCliente = catraca?.empresa?.idCliente;
  if (!idCliente) return mapa;

  const alunos = await db.aluno.findMany({
    where: { idCliente, nrUsuarioCatraca: { in: numeros }, boInativo: false },
    select: { id: true, nrUsuarioCatraca: true },
  });

  for (const aluno of alunos) {
    if (aluno.nrUsuarioCatraca !== null) {
      mapa.set(String(aluno.nrUsuarioCatraca), aluno.id);
    }
  }
  return mapa;
}

async function persistEvents(db: PrismaClient, params: {
  events: ControlidNormalizedEvent[];
  idCatraca: number | null;
  anIpOrigem: string;
}) {
  const { events, idCatraca, anIpOrigem } = params;

  if (idCatraca == null || events.length === 0) {
    return 0;
  }

  const alunoPorUsuario = await resolveAlunosPorUsuarioCatraca(
    db,
    idCatraca,
    events.map((event) => event.nrUsuarioCatraca ?? '').filter((valor) => valor !== ''),
  );

  // Era um `for` com `await prisma.create()` por evento: N round trips
  // sequenciais. O comando de poll pede `limit: 100`, entao um unico push podia
  // custar 100 idas ao Postgres. Em Neon (serverless, latencia de rede por
  // query) isso e ~2-5s de handler segurando uma conexao do pool — com varias
  // catracas em polling simultaneo, o pool esgota e a API inteira degrada.
  // createMany insere o lote em UM comando.
  // skipDuplicates apoiado no unique (idCatraca, idEventoDispositivo): um lote
  // reenviado pelo equipamento e ignorado em vez de derrubar o push inteiro com
  // erro de constraint — a catraca receberia falha e tentaria de novo em loop.
  const result = await db.catracaEvento.createMany({
    skipDuplicates: true,
    data: events.map((event) => ({
      idCatraca,
      idAluno: event.nrUsuarioCatraca
        ? alunoPorUsuario.get(event.nrUsuarioCatraca) ?? null
        : null,
      idEventoDispositivo: event.idEventoDispositivo,
      nrUsuarioCatraca: event.nrUsuarioCatraca,
      nrTipoEvento: event.nrTipoEvento,
      dsTipoEvento: event.dsTipoEvento,
      boAcessoLiberado: event.boAcessoLiberado,
      dsIdentificacao: event.dsIdentificacao,
      dsCartao: event.dsCartao,
      dsPortal: event.dsPortal,
      dsDirecao: event.dsDirecao,
      anIpOrigem,
      dtEvento: event.dtEvento,
      jsPayload: event.raw as object,
    })),
  });

  return result.count;
}
