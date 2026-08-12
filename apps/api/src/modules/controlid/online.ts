// Modo de identificacao ONLINE da Control iD ("Modo Pro").
//
// Diferenca em relacao ao push (que so coleta o historico DEPOIS): aqui a
// catraca identifica a pessoa localmente e, antes de liberar a passagem,
// pergunta ao SmartGym o que fazer. Nos respondemos `event: 7` (concedido) ou
// `event: 6` (negado) aplicando a MESMA regra de negocio usada no resto do
// sistema (getStudentAccessStatus: plano vigente, sem pagamento em atraso, sem
// cancelamento). E o que permite barrar plano vencido na porta, em vez de
// apenas registrar que a pessoa entrou.
//
// Contrato (application/x-www-form-urlencoded no corpo):
//   POST <servidor>/new_user_identified.fcgi
//   device_id, user_id, event, time, portal_id, uuid, identifier_id, ...
//
// Resposta esperada pelo equipamento:
//   {"result": {"event": 7, "user_id": N, "user_name": "...", "portal_id": N,
//               "actions": [{"action": "catra", "parameters": "allow=clockwise"}]}}
//
// Doc: https://www.controlid.com.br/docs/access-api-pt/modos-de-operacao/eventos-de-identificacao-online/
import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../../shared/prisma.js';
import { getStudentAccessStatus } from '../../shared/studentAccess.js';

// Codigos de evento da resposta (subconjunto que usamos).
const EVENTO_ACESSO_NEGADO = 6;
const EVENTO_ACESSO_CONCEDIDO = 7;

// Acao enviada ao equipamento para liberar a passagem. `catra` destrava o giro
// de uma catraca; `door` aciona fechadura de porta. Configuravel porque o mesmo
// modulo atende os dois tipos de equipamento.
const ACCESS_ACTION = (process.env.CONTROLID_ACCESS_ACTION ?? 'catra').trim();
const ACCESS_ACTION_PARAMS =
  process.env.CONTROLID_ACCESS_ACTION_PARAMS ?? (ACCESS_ACTION === 'door' ? 'door=1' : 'allow=clockwise');

// Janela anti-duplicidade do check-in. Sem isso, o aluno que gira a catraca,
// desiste e gira de novo gera dois check-ins e conta frequencia dobrada.
const CHECKIN_WINDOW_MINUTES = Number(process.env.CONTROLID_CHECKIN_WINDOW_MINUTES ?? 5);

// Mesma conversao aplicada aos eventos do push: o equipamento carimba com a
// hora LOCAL dele e envia como se fosse epoch UTC.
const DEVICE_UTC_OFFSET_MINUTES = Number(process.env.CONTROLID_DEVICE_UTC_OFFSET_MINUTES ?? 0);

export type OnlineIdentificationBody = {
  device_id?: unknown;
  user_id?: unknown;
  event?: unknown;
  time?: unknown;
  portal_id?: unknown;
  uuid?: unknown;
  identifier_id?: unknown;
  card_value?: unknown;
};

function asText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

function asInteger(value: unknown): number | null {
  const texto = asText(value);
  if (texto === '') return null;
  const numero = Number(texto);
  return Number.isFinite(numero) ? Math.trunc(numero) : null;
}

function horaDoEvento(value: unknown): Date {
  const segundos = asInteger(value);
  if (segundos === null || segundos <= 0) return new Date();
  const offset = Number.isFinite(DEVICE_UTC_OFFSET_MINUTES) ? DEVICE_UTC_OFFSET_MINUTES : 0;
  return new Date(segundos * 1000 - offset * 60_000);
}

type Decisao = {
  liberado: boolean;
  motivo: string;
  idAluno: number | null;
  nmAluno: string;
  idAlunoPlano: number | null;
};

// Resposta no formato que o firmware espera. Nao inclua campos fora do
// contrato: o equipamento ignora a resposta inteira se nao conseguir parsear.
function montarResposta(decisao: Decisao, userId: number | null, portalId: number) {
  if (!decisao.liberado) {
    return {
      result: {
        event: EVENTO_ACESSO_NEGADO,
        user_id: userId ?? 0,
        portal_id: portalId,
      },
    };
  }

  return {
    result: {
      event: EVENTO_ACESSO_CONCEDIDO,
      user_id: userId ?? 0,
      user_name: decisao.nmAluno,
      user_image: false,
      portal_id: portalId,
      actions: [{ action: ACCESS_ACTION, parameters: ACCESS_ACTION_PARAMS }],
    },
  };
}

async function decidirAcesso(params: {
  idCliente: number;
  userId: number | null;
}): Promise<Decisao> {
  const { idCliente, userId } = params;

  if (userId === null || userId <= 0) {
    return {
      liberado: false,
      motivo: 'Identificacao sem usuario valido.',
      idAluno: null,
      nmAluno: '',
      idAlunoPlano: null,
    };
  }

  // Busca SEMPRE escopada pelo cliente dono da catraca — o numero de usuario e
  // unico por cliente, nao globalmente.
  const aluno = await prisma.aluno.findFirst({
    where: { idCliente, nrUsuarioCatraca: userId, boInativo: false },
    select: { id: true, nmAluno: true },
  });

  if (!aluno) {
    return {
      liberado: false,
      motivo: 'Usuario da catraca nao esta vinculado a um aluno ativo.',
      idAluno: null,
      nmAluno: '',
      idAlunoPlano: null,
    };
  }

  // Mesma porta de entrada usada por check-in manual, login e app: uma regra so
  // para "aluno esta em dia".
  const status = await getStudentAccessStatus(prisma, aluno.id);

  return {
    liberado: status.canAccess,
    motivo: status.canAccess ? '' : status.reason ?? 'Acesso nao permitido.',
    idAluno: aluno.id,
    nmAluno: aluno.nmAluno,
    idAlunoPlano: status.idAlunoPlano,
  };
}

// Registra a decisao para auditoria. `boDecisaoOnline: true` separa este
// registro do log que a catraca envia depois pelo push referente a mesma
// passagem.
async function registrarDecisao(params: {
  idCatraca: number;
  decisao: Decisao;
  userId: number | null;
  portalId: number;
  dtEvento: Date;
  anIpOrigem: string;
  corpo: OnlineIdentificationBody;
}) {
  const { idCatraca, decisao, userId, portalId, dtEvento, anIpOrigem, corpo } = params;

  await prisma.catracaEvento.create({
    data: {
      idCatraca,
      idAluno: decisao.idAluno,
      idEventoDispositivo: null,
      nrUsuarioCatraca: userId !== null ? String(userId) : null,
      nrTipoEvento: decisao.liberado ? EVENTO_ACESSO_CONCEDIDO : EVENTO_ACESSO_NEGADO,
      dsTipoEvento: decisao.liberado ? 'acesso_liberado' : 'acesso_negado',
      boAcessoLiberado: decisao.liberado,
      dsMotivo: decisao.motivo.slice(0, 200),
      boDecisaoOnline: true,
      dsIdentificacao: asText(corpo.identifier_id),
      dsCartao: asText(corpo.card_value),
      dsPortal: String(portalId),
      dsDirecao: '',
      anIpOrigem,
      dtEvento,
      jsPayload: corpo as object,
    },
  });
}

// Check-in do aluno, reaproveitando o TipoCheckIn "Catraca" ja existente.
// So e criado quando o acesso e concedido — negativa nao e frequencia.
async function registrarCheckIn(params: {
  idAluno: number;
  idAlunoPlano: number | null;
  idEmpresa: number;
}): Promise<boolean> {
  const { idAluno, idAlunoPlano, idEmpresa } = params;

  const janela = Number.isFinite(CHECKIN_WINDOW_MINUTES) && CHECKIN_WINDOW_MINUTES > 0
    ? CHECKIN_WINDOW_MINUTES
    : 5;
  // Janela medida pelo relogio do SERVIDOR, comparada com `dtCadastro`, que
  // tambem e do servidor. Usar aqui a hora relatada pelo equipamento (como
  // estava) comparava duas bases de tempo diferentes: bastava o relogio da
  // catraca estar adiantado para a janela cair inteira no futuro, nunca casar
  // com nenhum check-in existente e a protecao virar decoracao — o aluno que
  // gira, desiste e gira de novo contaria frequencia dobrada.
  const desde = new Date(Date.now() - janela * 60_000);

  const jaRegistrado = await prisma.alunoCheckIn.findFirst({
    where: { idAluno, idEmpresa, boInativo: false, dtCadastro: { gte: desde } },
    select: { id: true },
  });
  if (jaRegistrado) return false;

  const tipoCatraca = await prisma.tipoCheckIn.findFirst({
    where: { dsTipoCheckIn: 'Catraca', boInativo: false },
    select: { id: true },
  });

  await prisma.alunoCheckIn.create({
    data: {
      idEmpresa,
      idAluno,
      idAlunoPlano,
      idTipoCheckIn: tipoCatraca?.id ?? null,
    },
  });
  return true;
}

export async function handleIdentificacaoOnline(
  request: FastifyRequest,
  reply: FastifyReply,
  extrairToken: (request: FastifyRequest) => string,
) {
  const corpo = (typeof request.body === 'object' && request.body !== null
    ? request.body
    : {}) as OnlineIdentificationBody;

  const deviceId = asText(corpo.device_id);
  const userId = asInteger(corpo.user_id);
  const portalId = asInteger(corpo.portal_id) ?? 1;
  const dtEvento = horaDoEvento(corpo.time);
  const clientIp = request.ip ?? '';

  const catraca = deviceId
    ? await prisma.catraca.findFirst({
        where: { caSerial: deviceId },
        select: {
          id: true,
          caToken: true,
          boInativo: true,
          idEmpresa: true,
          empresa: { select: { idCliente: true } },
        },
      })
    : null;

  // Equipamento desconhecido: nega. Liberar aqui seria aceitar que qualquer
  // aparelho na rede mande `device_id` arbitrario e abra a catraca.
  if (!catraca) {
    request.log.warn(
      { deviceId, ip: clientIp, userId },
      'Identificacao online de equipamento nao cadastrado — acesso negado.',
    );
    return reply.code(200).send({
      result: { event: EVENTO_ACESSO_NEGADO, user_id: userId ?? 0, portal_id: portalId },
    });
  }

  const tokenEsperado = (catraca.caToken ?? '').trim();
  if (tokenEsperado && extrairToken(request) !== tokenEsperado) {
    request.log.warn(
      { deviceId, idCatraca: catraca.id, ip: clientIp },
      'Identificacao online recusada: token do device invalido.',
    );
    return reply.code(401).send({ ok: false, error: 'token_invalido' });
  }

  const idCliente = catraca.empresa?.idCliente ?? null;

  // Catraca ainda nao vinculada a uma empresa nao tem como resolver aluno
  // nenhum: sem dono, sem escopo de busca. Nega e deixa o motivo no log.
  const decisao = idCliente
    ? await decidirAcesso({ idCliente, userId })
    : {
        liberado: false,
        motivo: 'Catraca nao esta vinculada a uma empresa.',
        idAluno: null,
        nmAluno: '',
        idAlunoPlano: null,
      };

  await registrarDecisao({
    idCatraca: catraca.id,
    decisao,
    userId,
    portalId,
    dtEvento,
    anIpOrigem: clientIp,
    corpo,
  });

  let checkInCriado = false;
  if (decisao.liberado && decisao.idAluno && catraca.idEmpresa) {
    checkInCriado = await registrarCheckIn({
      idAluno: decisao.idAluno,
      idAlunoPlano: decisao.idAlunoPlano,
      idEmpresa: catraca.idEmpresa,
    });
  }

  request.log.info(
    {
      idCatraca: catraca.id,
      userId,
      idAluno: decisao.idAluno,
      liberado: decisao.liberado,
      motivo: decisao.motivo || undefined,
      checkInCriado,
    },
    decisao.liberado ? 'Acesso CONCEDIDO pela catraca.' : 'Acesso NEGADO pela catraca.',
  );

  return reply.code(200).send(montarResposta(decisao, userId, portalId));
}
