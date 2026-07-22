import { z } from 'zod';
import { toBool } from '../../shared/normalize.js';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../../shared/prisma.js';
import { assertValidId, optionalNumber } from '../../shared/normalize.js';
import {
  parseControlidPush,
  type ControlidDeviceInfo,
  type ControlidNormalizedEvent,
} from './events.js';

type CatracaPayload = {
  idEmpresa?: number | string | null;
  dsCatraca?: string;
  dsFabricante?: string;
  dsModelo?: string;
  caSerial?: string;
  anIp?: string;
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
  anMac: catracaTextField,
  caToken: catracaTextField,
  boInativo: z.preprocess((value) => toBool(value), z.boolean()),
});

function getClientIp(request: FastifyRequest): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]!.trim();
  }
  return request.ip ?? '';
}

// Extrai o token do device enviado no push. Aceitamos duas formas para cobrir
// diferentes firmwares/configuracoes de campo:
//   1) header `x-controlid-token` (forma primaria, ja lida pelo handler antigo);
//   2) campo `token` / `push_token` no corpo JSON (fallback para firmwares que
//      nao permitem header customizado).
// Retorna string vazia quando nenhum token e enviado.
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

// Localiza (ou cria) o registro da catraca usando o serial / MAC enviado no push.
// Se o equipamento ainda nao estiver cadastrado, criamos um registro inativo
// para o gestor visualizar e ativar manualmente no painel.
async function findOrAutoRegisterCatraca(device: ControlidDeviceInfo, clientIp: string) {
  const caSerial = device.caSerial;
  const anMac = device.anMac.toUpperCase();

  const where: { caSerial?: string; anMac?: string }[] = [];
  if (caSerial) where.push({ caSerial });
  if (anMac) where.push({ anMac });

  if (where.length === 0) {
    return null;
  }

  const existing = await prisma.catraca.findFirst({ where: { OR: where } });
  if (existing) return existing;

  return prisma.catraca.create({
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

// Tenta resolver `nrUsuarioCatraca` -> `idAluno`.
// Convencao adotada: o `user_id` cadastrado na catraca e o proprio `Aluno.id` do SmartGym.
// Se sua academia usa outra convencao (ex.: CPF), aqui e o lugar de ajustar.
async function resolveAlunoId(nrUsuarioCatraca: string | null): Promise<number | null> {
  if (!nrUsuarioCatraca) return null;
  const candidate = Number(nrUsuarioCatraca);
  if (!Number.isInteger(candidate) || candidate <= 0) return null;
  const aluno = await prisma.aluno.findUnique({
    where: { id: candidate },
    select: { id: true },
  });
  return aluno?.id ?? null;
}

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
      request.log.warn(
        {
          method: request.method,
          url: request.url,
          ip: request.ip,
          ua: userAgent,
          headers: request.headers,
        },
        'Possivel requisicao da catraca chegando em path NAO esperado.',
      );
    }
  });

  // Catch-all: aceita POST em qualquer rota /controlid/* para nao perder evento
  // caso a URL configurada na catraca esteja sem o /push.
  app.post('/controlid', async (request, reply) => {
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
  }>('/controlid/push', async (request, reply) => {
    return handleControlidPollRequest(request, reply);
  });

  app.post('/controlid/push', async (request, reply) => {
    return handleControlidPushRequest(request, reply);
  });

  // Alguns firmwares anexam /push tambem em GET. Cobertura defensiva.
  app.get<{
    Querystring: { deviceId?: string; uuid?: string };
  }>('/controlid/push/push', async (request, reply) => {
    return handleControlidPollRequest(request, reply);
  });
  app.post('/controlid/push/push', async (request, reply) => {
    return handleControlidPushRequest(request, reply);
  });

  // Endpoint para o equipamento testar conectividade.
  app.get('/controlid/health', async () => ({ ok: true, ts: new Date().toISOString() }));

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
      return prisma.catraca.findMany({
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
    },
  );

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
        const empresa = await prisma.empresa.findFirst({
          where: { id: data.idEmpresa, idCliente },
          select: { id: true },
        });
        if (!empresa) throw new Error('Empresa nao pertence ao cliente.');
      }
      const created = await prisma.catraca.create({ data });
      return reply.code(201).send(created);
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao cadastrar catraca.',
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
        const existing = await prisma.catraca.findUnique({
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
          const empresa = await prisma.empresa.findFirst({
            where: { id: data.idEmpresa, idCliente },
            select: { id: true },
          });
          if (!empresa) throw new Error('Empresa nao pertence ao cliente.');
        }
        return prisma.catraca.update({ where: { id }, data });
      } catch (error) {
        return reply.code(400).send({
          message: error instanceof Error ? error.message : 'Erro ao atualizar catraca.',
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
        const existing = await prisma.catraca.findFirst({
          where: { id, empresa: { idCliente } },
          select: { id: true },
        });
        if (!existing) return reply.code(404).send({ message: 'Registro nao encontrado.' });
        return prisma.catraca.update({
          where: { id },
          data: { boInativo: toBool(request.body.boInativo) },
        });
      } catch (error) {
        return reply.code(400).send({
          message: error instanceof Error ? error.message : 'Erro ao alterar status da catraca.',
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
    const onlyGranted = parsedQuery.data.onlyGranted === 'true';
    const limit = Math.min(Math.max(parsedQuery.data.limit ?? 100, 1), 500);

    return prisma.catracaEvento.findMany({
      where: {
        ...(idCatraca ? { idCatraca } : {}),
        ...(onlyGranted ? { boAcessoLiberado: true } : {}),
        // Mesma regra da listagem de catracas: eventos de catracas ainda nao
        // vinculadas (idEmpresa null) ficam visiveis a todos os tenants ate a
        // reivindicacao. RISCO RESIDUAL aceito para o fluxo de ativacao; catracas
        // ja reclamadas por outro tenant continuam filtradas por empresa.idCliente,
        // entao nenhum evento de aluno de outro tenant vaza aqui.
        catraca: { OR: [{ idEmpresa: null }, { empresa: { idCliente } }] },
      },
      orderBy: { dtEvento: 'desc' },
      take: limit,
    });
  });
}

// Trata o GET periodico que a catraca faz pedindo comandos.
// Em vez de devolver lista vazia, devolvemos um comando "load access_logs"
// pedindo todos os eventos novos. A catraca executa o comando e POSTa o
// resultado de volta no /controlid/push.
async function handleControlidPollRequest(
  request: FastifyRequest<{ Querystring: { deviceId?: string; uuid?: string } }>,
  reply: FastifyReply,
) {
  const clientIp = getClientIp(request);
  const deviceId = (request.query.deviceId ?? '').trim();
  const uuid = (request.query.uuid ?? '').trim();

  request.log.info(
    { url: request.url, ip: clientIp, deviceId, uuid },
    'Polling da Control iD recebido (GET).',
  );

  // Localiza ou auto-registra a catraca usando o deviceId enviado.
  let catraca = null;
  if (deviceId) {
    catraca = await prisma.catraca.findFirst({ where: { caSerial: deviceId } });
    if (!catraca) {
      catraca = await prisma.catraca.create({
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
    }
    await prisma.catraca.update({
      where: { id: catraca.id },
      data: { dtUltimoPush: new Date(), anIp: clientIp || catraca.anIp },
    });
  }

  // Descobre o ultimo evento ja recebido dessa catraca para pedir apenas
  // os mais novos (id > ultimo). Se nunca recebemos nada, pede tudo (id > 0).
  let lastEventId = 0;
  if (catraca) {
    const last = await prisma.catracaEvento.findFirst({
      where: { idCatraca: catraca.id },
      orderBy: { idEventoDispositivo: 'desc' },
      select: { idEventoDispositivo: true },
    });
    if (last?.idEventoDispositivo !== null && last?.idEventoDispositivo !== undefined) {
      // BigInt -> Number (aceitavel pois IDs cabem em Number.MAX_SAFE_INTEGER).
      lastEventId = Number(last.idEventoDispositivo);
    }
  }

  // Formato esperado pelo firmware Control iD 5.x: array de comandos.
  // Sintaxe do "where" segue a REST API da Control iD: {coluna: [op, valor]}.
  const commands = [
    {
      id: 1,
      type: 'load',
      object: 'access_logs',
      where: {
        access_logs: {
          id: ['>', lastEventId],
        },
      },
      limit: 100,
    },
  ];

  request.log.info(
    { deviceId, lastEventId, commands },
    'Polling: pedindo access_logs novos a catraca.',
  );

  return reply.code(200).send(commands);
}

async function handleControlidPushRequest(request: FastifyRequest, reply: FastifyReply) {
  const clientIp = getClientIp(request);

  // Log de diagnostico - mostra exatamente o que a catraca esta mandando.
  request.log.info(
    {
      url: request.url,
      ip: clientIp,
      contentType: request.headers['content-type'],
      bodyType: typeof request.body,
      body: request.body,
    },
    'Push da Control iD: requisicao recebida.',
  );

  try {
    const { device, events } = parseControlidPush(request.body);

    const catraca = await findOrAutoRegisterCatraca(device, clientIp);

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
      await prisma.catraca.update({
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

    const created = await persistEvents({
      events,
      idCatraca: catraca?.id ?? null,
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

async function persistEvents(params: {
  events: ControlidNormalizedEvent[];
  idCatraca: number | null;
  anIpOrigem: string;
}) {
  const { events, idCatraca, anIpOrigem } = params;
  let persisted = 0;

  if (idCatraca == null) {
    return persisted;
  }

  for (const event of events) {
    await prisma.catracaEvento.create({
      data: {
        idCatraca,
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
      },
    });

    persisted += 1;
  }

  return persisted;
}
