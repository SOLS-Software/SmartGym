import { z } from 'zod';
import { toBool } from '../../shared/normalize.js';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@solsfit/db';
import { prisma } from '../../shared/prisma.js';
import {
  normalizeStudentPayload,
  normalizeStudentFacialBiometricPayload,
  assertValidId,
  optionalNumber,
  optionalDate,
  numeroNaFaixa,
} from '../../shared/normalize.js';
import { getSupabaseConfig, getSupabaseClient } from '../../shared/supabase.js';
import {
  getComprefaceConfig,
  getStudentFacialSubject,
  addComprefaceSubjectExample,
} from '../../shared/compreface.js';
import { anonymizeStudent } from '../../shared/anonymize.js';
import { sincronizarChaveDeLogin } from '../../shared/loginKey.js';
import { assertAllowedUploadType, assertUploadBuffer, getStudentFilePath } from '../../shared/files.js';
import { assertConsent } from '../../shared/consent.js';
import { generateNextRecurringPayment } from '../../shared/payments.js';
import { getStudentAccessStatus } from '../../shared/studentAccess.js';
// PILOTO DO ROLLOUT MULTI-TENANT: so estes dois GET usam o resolver por tenant.
// Sem registro em tb_ClienteConexoes, getTenantDb devolve o `prisma` padrao —
// entao o comportamento de quem nao foi migrado nao muda. Ver docs/multi-tenancy-dados.md.
import { getTenantDb } from '../../shared/tenantDataSource.js';
import { syncStudentNotifications } from '../../shared/notifications.js';
import { creditCheckInPoints, getPointsBalance, registerPointsEntry } from '../../shared/loyalty.js';
import {
  cpfHash,
  decryptCpfValue,
  encryptCpfFields,
  encryptEmbedding,
  withDecryptedCpf,
  withDecryptedCpfList,
} from '../../shared/pii.js';
import type {
  CompanyChildPayload,
  StudentFacialBiometricEnrollPayload,
  StudentFacialBiometricPayload,
  StudentPayload,
} from '../../shared/api-types.js';
import { clientErrorMessage } from '../../shared/errors.js';
import { buildChargeForPayment } from '../../shared/pixCharge.js';
import { getStatusIdByName } from '../../shared/payments.js';
import { enrollStudentInPlan } from '../../shared/enrollment.js';
import { buildSelfCheckInData, inicioDoDia } from '../../shared/selfCheckIn.js';
import {
  carregarBeneficiosDoAluno,
  registrarUsoDeBeneficio,
} from '../../shared/planBenefitsDb.js';
import { assertPlanoCobreAtividades } from '../../shared/planCoverageDb.js';
import { registerStudentLockRoutes } from './trancamentos.js';
import { trancamentoVigente } from '../../shared/trancamento.js';

// Extrato de pontos e append-only: cada linha guarda o saldo que existia
// depois dela, entao alterar ou apagar uma linha antiga tornaria mentira o
// saldo de todas as seguintes. Correcao se faz com um lancamento de sinal
// contrario — o mesmo que qualquer livro-caixa faz.
// Execucao nao tem PUT proprio: o POST ja e upsert por (sessao, exercicio),
// entao corrigir a carga e reenviar o mesmo POST. Duas portas para a mesma
// escrita so criariam divergencia de validacao entre elas.
const EXECUCAO_VIA_POST =
  'Para corrigir uma execucao, envie o registro de novo pela mesma rota de criacao.';

const EXTRATO_IMUTAVEL =
  'Lancamento de pontos nao pode ser alterado. Faca um lancamento de correcao com o sinal contrario.';

function getStudentChildResourceConfig(resource: string) {
  if (
    resource !== 'plans' &&
    resource !== 'payments' &&
    resource !== 'check-ins' &&
    resource !== 'trainings' &&
    resource !== 'evolutions' &&
    resource !== 'points' &&
    resource !== 'executions'
  ) {
    throw new Error('Tabela relacionada invalida.');
  }
  return resource;
}

// Validacao minima de entrada: os valores continuam passando pelos helpers
// normalize* (optionalNumber/optionalDate/toBool) apos o safeParse.
const numberLike = z.union([z.number(), z.string()]).nullish();
const dateLike = z.union([z.string(), z.number(), z.date()]).nullish();
const boolLike = z.union([z.boolean(), z.number(), z.string()]).nullish();

const studentListQuerySchema = z.object({
  search: z.string().optional(),
  limit: z.coerce.number().int().optional(),
});

const listLimitQuerySchema = z.object({
  limit: z.coerce.number().int().optional(),
});

const executionQuerySchema = listLimitQuerySchema.extend({
  idAlunoCheckIn: z.coerce.number().int().optional(),
});

const calendarQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
});

const statusBodySchema = z.object({
  boInativo: boolLike,
  // Cancelamento de plano: por que o aluno saiu. Opcional para nao travar
  // fluxos antigos, mas a tela pergunta.
  idMotivoCancelamento: numberLike,
  dsMotivoCancelamento: z.string().max(255).nullish(),
});

const facialBiometricEnrollBodySchema = z.object({
  idAlunoArquivo: numberLike,
  nrThreshold: numberLike,
});

const childResourceBodySchema = z.object({
  idPlano: numberLike,
  idPromocaoPlano: numberLike,
  nrDiaPagamento: numberLike,
  qtParcelas: numberLike,
  dtAdmissao: dateLike,
  idEmpresa: numberLike,
  idTreino: numberLike,
  idFuncionario: numberLike,
  nrOrdemSequencia: numberLike,
  idAlunoPlano: numberLike,
  idStatusPagamento: numberLike,
  idFormaPagamento: numberLike,
  idProdutoMovimentacao: numberLike,
  vlPrevisto: numberLike,
  vlPago: numberLike,
  dtVencimento: dateLike,
  dtCompetencia: dateLike,
  dtPagamento: dateLike,
  idAlunoTreinosSequencia: numberLike,
  idPontuacao: numberLike,
  idTipoCheckIn: numberLike,
  // Avaliacao fisica (resource 'evolutions').
  idAlunoArquivo: numberLike,
  dtAvaliacao: dateLike,
  vlAltura: numberLike,
  vlPeso: numberLike,
  vlPercentualGordura: numberLike,
  vlMassaMagra: numberLike,
  vlCircPeitoral: numberLike,
  vlCircCintura: numberLike,
  vlCircQuadril: numberLike,
  vlCircBraco: numberLike,
  vlCircCoxa: numberLike,
  dsObservacao: z.string().max(1000).nullish(),
  // Lancamento manual de pontos (resource 'points').
  qtPontos: numberLike,
  dsHistorico: z.string().max(255).nullish(),
  // Execucao do treino (resource 'executions').
  idAlunoCheckIn: numberLike,
  idTreinoExercicio: numberLike,
  nrSeriesFeitas: numberLike,
  nrRepeticoes: numberLike,
  vlCarga: numberLike,
  idUnidadeMedida: numberLike,
  boConcluido: boolLike,
  boInativo: boolLike,
});

// Paginacao das listagens top-level: clamp 1..1000, default 1000.
function clampLimit(limit: number | undefined) {
  if (limit === undefined || !Number.isFinite(limit)) return 1000;
  return Math.min(1000, Math.max(1, Math.trunc(limit)));
}

type StudentActivityScheduleEnrollPayload = {
  scheduleIds?: Array<number | string>;
};

type EnrollmentSchedule = {
  id: number;
  idEmpresa: number | null;
  dtInicial: Date | null;
  dtFinal: Date | null;
  qtAlunos: number | null;
  atividade: { dsAtividade: string } | null;
  alunoAtividadeAgendas: Array<{ idAluno: number | null }>;
};

function formatScheduleLabel(schedule: EnrollmentSchedule) {
  const activityName = schedule.atividade?.dsAtividade ?? 'Atividade';
  const startsAt = schedule.dtInicial
    ? schedule.dtInicial.toLocaleString('pt-BR', {
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : 'sem data';
  return `${activityName} em ${startsAt}`;
}

function schedulesOverlap(first: EnrollmentSchedule, second: EnrollmentSchedule) {
  if (!first.dtInicial || !first.dtFinal || !second.dtInicial || !second.dtFinal) return false;
  return first.dtInicial < second.dtFinal && first.dtFinal > second.dtInicial;
}

function normalizeScheduleIds(payload: StudentActivityScheduleEnrollPayload) {
  if (!Array.isArray(payload.scheduleIds)) {
    throw new Error('Selecione ao menos uma aula para se inscrever.');
  }

  const ids = payload.scheduleIds ?? [];
  const normalized = Array.from(new Set(ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)));
  if (normalized.length === 0) {
    throw new Error('Selecione ao menos uma aula para se inscrever.');
  }
  return normalized;
}

// Tenant isolation: o aluno so e visivel se pertencer ao cliente do usuario
// autenticado (Aluno.idCliente).
function findTenantStudent(db: PrismaClient, idAluno: number, idCliente: number) {
  return db.aluno.findFirst({ where: { id: idAluno, idCliente }, select: { id: true } });
}

// Valida que a empresa informada pertence ao tenant do usuario autenticado.
async function assertTenantEmpresa(db: PrismaClient, idEmpresa: number, idCliente: number) {
  const empresa = await db.empresa.findFirst({
    where: { id: idEmpresa, idCliente },
    select: { id: true },
  });
  if (!empresa) throw new Error('Empresa invalida para este cliente.');
}

// A sessao de treino como o app do aluno enxerga: plano e treino escolhido,
// nada da operacao.
const SESSAO_INCLUDE = {
  alunoPlano: { include: { plano: true } },
  alunoTreinoSequencia: {
    include: { alunoTreino: { include: { treino: true, funcionario: true } } },
  },
};

/**
 * Abre (ou retoma) a sessao de treino do dia a pedido do proprio aluno.
 *
 * Nao e presenca: `boPresencial: false` mantem a sessao fora de frequencia,
 * evasao, ocupacao e fidelidade. Quem prova que a pessoa entrou na academia e a
 * catraca ou a recepcao; isto aqui existe para o aluno ter onde anotar o treino.
 */
async function abrirSessaoDoApp(
  request: FastifyRequest<{ Params: { id: string; resource: string }; Body: CompanyChildPayload }>,
  reply: FastifyReply,
  contexto: { idAluno: number; idCliente: number },
) {
  const { idAluno, idCliente } = contexto;

  // Mesma trava da porta: sem plano ativo ou com pagamento em atraso, nao abre.
  // O motivo volta para a tela — o aluno tem o direito de saber por que.
  const acesso = await getStudentAccessStatus(prisma, idAluno);
  if (!acesso.canAccess) {
    throw new Error(acesso.reason ?? 'Sem acesso liberado para treinar.');
  }

  const idAlunoTreinosSequencia = optionalNumber(request.body.idAlunoTreinosSequencia);
  if (idAlunoTreinosSequencia) {
    const sequencia = await request.tenantDb.alunoTreinoSequencia.findFirst({
      where: { id: idAlunoTreinosSequencia, alunoTreino: { idAluno } },
      select: { id: true },
    });
    if (!sequencia) throw new Error('Sequencia de treino invalida para o aluno.');
  }

  // Ja ha sessao hoje? Retoma em vez de criar outra. Duas situacoes reais: o
  // aluno passou pela catraca e depois tocou "iniciar treino" (a sessao dele e
  // a da porta, presencial, e a carga anotada tem que ir para ELA), e o toque
  // duplo no botao. Sem isto, o treino do dia sairia partido em duas linhas.
  const sessaoDeHoje = await request.tenantDb.alunoCheckIn.findFirst({
    where: { idAluno, boInativo: false, dtCadastro: { gte: inicioDoDia(new Date()) } },
    orderBy: { dtCadastro: 'desc' },
    include: SESSAO_INCLUDE,
  });

  if (sessaoDeHoje) {
    // A sessao da catraca nasce sem treino escolhido. Se o aluno acabou de
    // dizer qual esta fazendo, anota — e so isso; o resto da linha da porta
    // continua intocado.
    if (idAlunoTreinosSequencia && !sessaoDeHoje.idAlunoTreinosSequencia) {
      const atualizada = await request.tenantDb.alunoCheckIn.update({
        where: { id: sessaoDeHoje.id },
        data: { idAlunoTreinosSequencia },
        include: SESSAO_INCLUDE,
      });
      return reply.code(200).send(atualizada);
    }
    return reply.code(200).send(sessaoDeHoje);
  }

  const planoAtivo = await request.tenantDb.alunoPlano.findFirst({
    where: { idAluno, boInativo: false },
    orderBy: { dtCadastro: 'desc' },
    select: { id: true },
  });

  // Filial: a da ultima visita — e onde o aluno treina. Sem historico, a
  // primeira do cliente, mesmo criterio da rota da recepcao. O corpo nao
  // escolhe: filial errada desloca o numero de outra unidade.
  const ultimaVisita = await request.tenantDb.alunoCheckIn.findFirst({
    where: { idAluno },
    orderBy: { dtCadastro: 'desc' },
    select: { idEmpresa: true },
  });
  const idEmpresa =
    ultimaVisita?.idEmpresa ??
    (await request.tenantDb.empresa.findFirst({ where: { idCliente }, select: { id: true } }))?.id ??
    null;
  if (!idEmpresa) throw new Error('Nao foi possivel identificar a filial da sessao.');

  // Sem creditCheckInPoints, ao contrario do caminho da recepcao: ponto e por
  // presenca, e presenca quem atesta e a porta.
  const criada = await request.tenantDb.alunoCheckIn.create({
    data: buildSelfCheckInData({
      idAluno,
      idEmpresa,
      idAlunoPlano: planoAtivo?.id ?? null,
      idAlunoTreinosSequencia,
    }),
    include: SESSAO_INCLUDE,
  });

  return reply.code(201).send(criada);
}

// A leitura dos direitos e a baixa moram em shared/planBenefitsDb.ts: as duas
// portas (o balcao de vendas e o painel da recepcao) precisam do mesmo
// comportamento, e a baixa do estoque nao pode existir so numa delas.
async function carregarBeneficios(idAluno: number, idCliente: number) {
  const estado = await carregarBeneficiosDoAluno(prisma, idAluno, idCliente);
  return {
    idAlunoPlano: estado.idAlunoPlano,
    dsPlano: estado.dsPlano,
    beneficios: estado.beneficios,
  };
}

export async function registerStudentRoutes(app: FastifyInstance) {
  await registerStudentLockRoutes(app);

  // ---------------------------------------------------------------------------
  // LGPD — direito de acesso e portabilidade do titular (art. 18, II e V)
  //
  // Reune, num JSON legivel, TODO o dado pessoal do aluno que a academia trata:
  // ficha, planos, pagamentos, avaliacao fisica (dado de saude), frequencia,
  // pontos, avisos, solicitacoes e o METADADO da biometria — nunca o embedding
  // em si (a API nunca devolve o vetor). Escopado por tenant; o proprio aluno
  // exporta os seus (studentRbac libera GET /students/:id/lgpd-export para o
  // dono) e a equipe exporta a pedido do titular (cai em students.read).
  // ---------------------------------------------------------------------------
  app.get<{ Params: { id: string } }>('/students/:id/lgpd-export', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idAluno = Number(request.params.id);
      assertValidId(idAluno, 'Aluno invalido.');

      const aluno = await request.tenantDb.aluno.findFirst({
        where: { id: idAluno, idCliente },
        include: {
          cliente: { select: { dsCliente: true } },
          alunoPlanos: { include: { plano: { select: { dsPlano: true } } } },
          alunoEvolucoes: true,
          alunoTreinos: { include: { treino: { select: { dsTreino: true } } } },
          alunoCheckIns: true,
          alunosPontuacoes: true,
          notificacoes: true,
          solicitacoesPlano: true,
          catracaEventos: true,
          // Metadado da biometria — NUNCA o vetor (anEmbedding fica de fora).
          alunobiometriafacial: {
            select: {
              id: true,
              dsProvider: true,
              dsModelo: true,
              dtCadastro: true,
              dtAlteracao: true,
              boInativo: true,
            },
          },
        },
      });

      if (!aluno) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

      const { caCPF, caCPFHash: _hash, ...resto } = aluno;
      return reply
        .header('Content-Disposition', `attachment; filename="dados-aluno-${idAluno}.json"`)
        .send({
          _meta: {
            titular: idAluno,
            academia: aluno.cliente?.dsCliente ?? null,
            geradoEm: new Date().toISOString(),
            baseLegal:
              'Art. 18, II (acesso) e V (portabilidade) da LGPD. Metadados de biometria incluidos; o vetor biometrico nao e exportado.',
          },
          ...resto,
          // CPF decifrado para o proprio titular; o hash de lookup fica de fora.
          caCPF: decryptCpfValue(caCPF),
        });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ message: 'Erro ao gerar a exportacao de dados.' });
    }
  });

  // ---------------------------------------------------------------------------
  // LGPD — consentimento especifico por finalidade (art. 8 e art. 11)
  //
  // GET devolve o estado ATUAL (registro mais recente por finalidade) + o
  // historico. POST registra uma concessao OU revogacao (append-only). O
  // proprio aluno concede/revoga pelo app (studentRbac libera estes dois no
  // seu id); a equipe registra a pedido (students.read/.write).
  // ---------------------------------------------------------------------------
  const CONSENT_PURPOSES = new Set(['biometria_facial', 'comunicacao_email', 'push']);

  app.get<{ Params: { id: string } }>('/students/:id/consents', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idAluno = Number(request.params.id);
      assertValidId(idAluno, 'Aluno invalido.');
      if (!(await findTenantStudent(request.tenantDb, idAluno, idCliente))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      const registros = await request.tenantDb.consentimento.findMany({
        where: { idAluno, idCliente },
        orderBy: { dtRegistro: 'desc' },
      });
      // Estado atual = o registro mais recente de cada finalidade.
      const atual: Record<string, { concedido: boolean; em: Date; versao: string | null }> = {};
      for (const r of registros) {
        if (!(r.cnFinalidade in atual)) {
          atual[r.cnFinalidade] = { concedido: r.boConcedido, em: r.dtRegistro, versao: r.dsVersaoTermo };
        }
      }
      return { idAluno, atual, historico: registros };
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ message: 'Erro ao consultar consentimentos.' });
    }
  });

  app.post<{
    Params: { id: string };
    Body: { cnFinalidade?: string; boConcedido?: unknown; dsVersaoTermo?: string };
  }>('/students/:id/consents', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idAluno = Number(request.params.id);
      assertValidId(idAluno, 'Aluno invalido.');
      if (!(await findTenantStudent(request.tenantDb, idAluno, idCliente))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      const cnFinalidade = String(request.body?.cnFinalidade ?? '');
      if (!CONSENT_PURPOSES.has(cnFinalidade)) {
        return reply.code(400).send({ message: 'Finalidade de consentimento invalida.' });
      }
      const registro = await request.tenantDb.consentimento.create({
        data: {
          idCliente,
          idAluno,
          cnFinalidade,
          boConcedido: toBool(request.body?.boConcedido),
          dsVersaoTermo: request.body?.dsVersaoTermo?.slice(0, 40) || null,
          anIpOrigem: (request.ip ?? '').slice(0, 64) || null,
        },
      });
      return reply.code(201).send(registro);
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao registrar consentimento.'),
      });
    }
  });

  // ---------------------------------------------------------------------------
  // LGPD — eliminação por anonimização (art. 18, VI)
  //
  // Decisão de negócio: ANONIMIZAR mantendo o financeiro. Apaga a PII e o dado
  // sensível (biometria local + no CompreFace, avaliação física, arquivos) e
  // embaralha a identidade da ficha, mas PRESERVA planos e pagamentos (retenção
  // fiscal) — agora ligados a um titular sem identidade. Irreversível; operação
  // da equipe (students.write) a pedido do titular. O acesso fica na trilha.
  // ---------------------------------------------------------------------------
  app.post<{ Params: { id: string } }>('/students/:id/anonymize', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idAluno = Number(request.params.id);
      assertValidId(idAluno, 'Aluno invalido.');
      if (!(await findTenantStudent(request.tenantDb, idAluno, idCliente))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

      // A logica de anonimizacao vive em shared/anonymize.ts (reusada pelo
      // expurgo em lote); a rota so valida a posse por tenant acima.
      return await anonymizeStudent(idAluno, idCliente, { log: request.log });
    } catch (error) {
      request.log.error(error);
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao anonimizar o titular.'),
      });
    }
  });

  // ---------------------------------------------------------------------------
  // Students CRUD
  // ---------------------------------------------------------------------------

  app.get<{
    Querystring: { search?: string };
  }>('/students', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    const parsedQuery = studentListQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.code(400).send({ message: 'Parametros invalidos.' });
    }
    const search = parsedQuery.data.search?.trim();
    // CPF criptografado: busca parcial por CPF nao e possivel; CPF completo
    // (11 digitos) e resolvido por igualdade via caCPFHash.
    const searchDigits = search?.replace(/\D/g, '') ?? '';
    const db = await getTenantDb(idCliente);
    const students = await db.aluno.findMany({
      where: search
        ? {
            idCliente,
            OR: [
              { nmAluno: { contains: search, mode: 'insensitive' } },
              { anEmail: { contains: search, mode: 'insensitive' } },
              ...(searchDigits.length === 11 ? [{ caCPFHash: cpfHash(searchDigits) }] : []),
            ],
          }
        : { idCliente },
      orderBy: { nmAluno: 'asc' },
      take: clampLimit(parsedQuery.data.limit),
    });
    return withDecryptedCpfList(students);
  });

  app.post<{
    Body: StudentPayload;
  }>('/students', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      // Tenant sempre do token; idCliente vindo do body e ignorado.
      const data = normalizeStudentPayload({ ...request.body, idCliente });
      // PII: grava o CPF criptografado + hash de lookup.
      const student = await request.tenantDb.aluno.create({
        data: { ...data, ...encryptCpfFields(data.caCPF) },
      });
      return reply.code(201).send(withDecryptedCpf(student));
    } catch (error) {
      const isPrismaUnique =
        error instanceof Error &&
        'code' in error &&
        (error as { code: string }).code === 'P2002';
      return reply.code(400).send({
        // 'Erro ao criar aluno.' fixo engolia as mensagens de
        // normalizeStudentPayload ("Informe um CPF valido.", nome invalido) e a
        // tela ficava sem dizer o que corrigir. O PUT ja usava clientErrorMessage.
        message: isPrismaUnique
          ? 'CPF já cadastrado para este cliente.'
          : clientErrorMessage(error, 'Erro ao criar aluno.'),
      });
    }
  });

  app.get<{
    Params: { id: string };
    Querystring: { idEmpresa?: string };
  }>('/students/:id', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const id = Number(request.params.id);
      assertValidId(id, 'Aluno invalido.');
      // A recepcao pergunta pela FILIAL dela: sem isso a ficha diria "acesso
      // liberado" e o check-in logo em seguida recusaria por unidade — a tela
      // discordando da porta, que e justamente o que evitamos aqui.
      const idEmpresaConsulta = optionalNumber(request.query?.idEmpresa);
      const db = await getTenantDb(idCliente);
      const student = await db.aluno.findFirst({ where: { id, idCliente } });

      if (!student) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

      // "Esse aluno pode treinar hoje?" acompanha a ficha: e a pergunta que a
      // recepcao faz antes de qualquer outra, e vem da MESMA funcao que a
      // catraca usa — a tela nunca discorda da porta.
      return {
        ...withDecryptedCpf(student),
        // Mesmo client do aluno: a situacao de acesso le plano e pagamento, que
        // sao dados de aplicacao e moram no banco do tenant junto com a ficha.
        studentAccess: await getStudentAccessStatus(db, id, idEmpresaConsulta),
      };
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao carregar aluno.'),
      });
    }
  });

  app.put<{
    Params: { id: string };
    Body: StudentPayload;
  }>('/students/:id', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const id = Number(request.params.id);
      assertValidId(id, 'Aluno invalido.');
      const current = await findTenantStudent(request.tenantDb, id, idCliente);
      if (!current) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

      // O RBAC do aluno libera PUT no PROPRIO cadastro. Como o handler grava o
      // payload inteiro, o aluno conseguia reescrever campos de IDENTIDADE:
      //  - caCPF: o CPF e a credencial de login (caCPFHash) e a chave de
      //    /auth/forgot-password. Trocando o proprio CPF pelo de alguem de outro
      //    tenant, o aluno passa a colidir com aquela pessoa nos lookups por CPF
      //    (que sao findFirst SEM idCliente) e pode sequestrar o fluxo de
      //    recuperacao de senha / travar o login dela.
      //  - nmAluno e boInativo: adulteracao de cadastro e auto-desativacao.
      // Funcionario/gestor seguem com o PUT completo (e a tela de cadastro do
      // web); para o papel aluno, os campos de identidade sao preservados do
      // registro atual — sobra o que a tela de perfil realmente edita (contato
      // e endereco).
      const isSelfService = request.user.role === 'student';
      const stored = isSelfService
        ? await request.tenantDb.aluno.findUnique({
            where: { id },
            select: { nmAluno: true, caCPF: true, caCPFHash: true, boInativo: true },
          })
        : null;

      const data = normalizeStudentPayload(
        {
          ...request.body,
          // Tenant sempre do token; idCliente vindo do body e ignorado.
          idCliente,
          ...(stored
            ? {
                nmAluno: stored.nmAluno,
                // normalizeStudentPayload exige um CPF valido: usamos o CPF ja
                // gravado (decifrado) para revalidar sem permitir troca.
                caCPF: decryptCpfValue(stored.caCPF),
                boInativo: stored.boInativo,
              }
            : {}),
        },
        // Nome fora do padrao ja gravado nao pode travar a tela de perfil do
        // aluno: aqui o nome vem do banco, nao do cliente.
        { validateNameFormat: !stored },
      );

      const updated = await request.tenantDb.aluno.update({
        where: { id },
        data: stored
          ? // Aluno editando a si mesmo: nem sequer reescreve as colunas de CPF.
            { ...data, caCPF: undefined, caCPFHash: undefined }
          : { ...data, ...encryptCpfFields(data.caCPF) },
      });
      // A chave de login vive na identidade central e nao acompanha a ficha
      // sozinha. Depois da ficha, nunca antes: ver shared/loginKey.ts.
      if (!stored) {
        await sincronizarChaveDeLogin({ idAluno: id }, updated.caCPFHash, request.log);
      }
      return withDecryptedCpf(updated);
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao atualizar aluno.'),
      });
    }
  });

  // Vinculo entre o aluno e o usuario cadastrado NA CATRACA.
  //
  // Rota propria, fora do PUT /students/:id, de proposito: o RBAC do aluno
  // libera o PUT no proprio cadastro, e `nrUsuarioCatraca` e campo de
  // PRIVILEGIO, nao de perfil. Se entrasse no payload geral, um aluno bloqueado
  // por inadimplencia poderia se apontar para um usuario da catraca que esta
  // sempre liberado e entrar assim mesmo. Aqui, por ser PATCH em subrecurso
  // fora da allowlist, o papel aluno e recusado por construcao.
  app.patch<{
    Params: { id: string };
    Body: { nrUsuarioCatraca?: number | string | null };
  }>('/students/:id/usuario-catraca', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const id = Number(request.params.id);
      assertValidId(id, 'Aluno invalido.');
      const current = await findTenantStudent(request.tenantDb, id, idCliente);
      if (!current) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

      const bruto = request.body?.nrUsuarioCatraca;
      // Vazio/null desvincula — e o que o operador faz quando o aluno sai ou
      // quando o numero foi digitado errado.
      const desvincular = bruto === null || bruto === undefined || bruto === '';
      let numero: number | null = null;
      if (!desvincular) {
        numero = Number(bruto);
        if (!Number.isInteger(numero) || numero <= 0) {
          return reply
            .code(400)
            .send({ message: 'Numero de usuario da catraca invalido.' });
        }
      }

      const updated = await request.tenantDb.aluno.update({
        where: { id },
        data: { nrUsuarioCatraca: numero },
        select: { id: true, nmAluno: true, nrUsuarioCatraca: true },
      });
      return updated;
    } catch (error) {
      const codigo =
        error instanceof Error && 'code' in error ? (error as { code: string }).code : '';
      if (codigo === 'P2002') {
        return reply.code(409).send({
          message: 'Este numero de usuario da catraca ja esta vinculado a outro aluno.',
        });
      }
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao vincular usuario da catraca.'),
      });
    }
  });

  app.patch<{
    Params: { id: string };
    Body: { boInativo?: number };
  }>('/students/:id/status', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const id = Number(request.params.id);
      assertValidId(id, 'Aluno invalido.');
      const current = await findTenantStudent(request.tenantDb, id, idCliente);
      if (!current) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      const parsedBody = statusBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.code(400).send({ message: 'Dados invalidos.' });
      }
      const boInativo = toBool(request.body.boInativo);
      return request.tenantDb.aluno.update({ where: { id }, data: { boInativo } });
    } catch {
      return reply.code(400).send({ message: 'Erro ao alterar status do aluno.' });
    }
  });

  // ---------------------------------------------------------------------------
  // Student files
  // ---------------------------------------------------------------------------

  app.get<{
    Params: { id: string };
  }>('/students/:id/files', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idAluno = Number(request.params.id);
      assertValidId(idAluno, 'Aluno invalido.');
      const parsedQuery = listLimitQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.code(400).send({ message: 'Parametros invalidos.' });
      }
      const student = await findTenantStudent(request.tenantDb, idAluno, idCliente);
      if (!student) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      return request.tenantDb.alunoArquivo.findMany({
        where: { idAluno, boInativo: false },
        orderBy: { dtCadastro: 'desc' },
        take: clampLimit(parsedQuery.data.limit),
      });
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao listar arquivos do aluno.'),
      });
    }
  });

  app.post<{
    Params: { id: string };
  }>('/students/:id/files', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idAluno = Number(request.params.id);
      assertValidId(idAluno, 'Aluno invalido.');

      const student = await findTenantStudent(request.tenantDb, idAluno, idCliente);

      if (!student) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

      const file = await request.file();
      if (!file) {
        return reply.code(400).send({ message: 'Envie um arquivo.' });
      }
      assertAllowedUploadType(file);

      const buffer = await file.toBuffer();
      const safeMime = await assertUploadBuffer(buffer);
      const path = getStudentFilePath(idAluno, file.filename);
      const { bucket } = getSupabaseConfig();
      const supabase = getSupabaseClient();
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, buffer, { contentType: safeMime, upsert: false });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const studentFile = await request.tenantDb.alunoArquivo.create({
        data: {
          idAluno,
          dsArquivo: file.filename,
          anCaminho: path,
          idTiposArquivos: null,
          cnChaveAcesso: 0,
          cnDistribuidor: 0,
        },
      });

      return reply.code(201).send(studentFile);
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao enviar arquivo do aluno.'),
      });
    }
  });

  app.get<{
    Params: { id: string; fileId: string };
  }>('/students/:id/files/:fileId/url', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idAluno = Number(request.params.id);
      const fileId = Number(request.params.fileId);
      assertValidId(idAluno, 'Aluno invalido.');
      assertValidId(fileId, 'Arquivo invalido.');

      const student = await findTenantStudent(request.tenantDb, idAluno, idCliente);
      if (!student) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

      const studentFile = await request.tenantDb.alunoArquivo.findFirst({
        where: { id: fileId, idAluno, boInativo: false },
      });

      if (!studentFile) {
        return reply.code(404).send({ message: 'Arquivo nao encontrado.' });
      }

      const { bucket } = getSupabaseConfig();
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(studentFile.anCaminho, 60 * 5);

      if (error) {
        throw new Error(error.message);
      }

      return { url: data.signedUrl, expiresIn: 60 * 5 };
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao gerar link do arquivo.'),
      });
    }
  });

  app.delete<{
    Params: { id: string; fileId: string };
  }>('/students/:id/files/:fileId', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idAluno = Number(request.params.id);
      const fileId = Number(request.params.fileId);
      assertValidId(idAluno, 'Aluno invalido.');
      assertValidId(fileId, 'Arquivo invalido.');

      const student = await findTenantStudent(request.tenantDb, idAluno, idCliente);
      if (!student) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

      const existingFile = await request.tenantDb.alunoArquivo.findFirst({
        where: { id: fileId, idAluno, boInativo: false },
      });

      if (!existingFile) {
        return reply.code(404).send({ message: 'Arquivo nao encontrado.' });
      }

      return request.tenantDb.alunoArquivo.update({ where: { id: fileId }, data: { boInativo: true } });
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao remover arquivo do aluno.'),
      });
    }
  });

  // ---------------------------------------------------------------------------
  // Facial biometrics
  // ---------------------------------------------------------------------------

  app.get<{
    Params: { id: string };
  }>('/students/:id/facial-biometrics', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idAluno = Number(request.params.id);
      assertValidId(idAluno, 'Aluno invalido.');
      const parsedQuery = listLimitQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.code(400).send({ message: 'Parametros invalidos.' });
      }
      const student = await findTenantStudent(request.tenantDb, idAluno, idCliente);
      if (!student) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      const biometrics = await request.tenantDb.alunoBiometriaFacial.findMany({
        where: { idAluno, boInativo: false },
        orderBy: { dtCadastro: 'desc' },
        take: clampLimit(parsedQuery.data.limit),
      });
      // Embedding e dado biometrico sensivel (criptografado at-rest): nunca
      // sai da API — o matching e feito pelo CompreFace.
      return biometrics.map(({ anEmbedding: _embedding, ...rest }) => rest);
    } catch (error) {
      return reply.code(400).send({
        message:
          clientErrorMessage(error, 'Erro ao listar biometrias faciais do aluno.'),
      });
    }
  });

  app.post<{
    Params: { id: string };
    Body: StudentFacialBiometricPayload;
  }>('/students/:id/facial-biometrics', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idAluno = Number(request.params.id);
      assertValidId(idAluno, 'Aluno invalido.');

      const data = normalizeStudentFacialBiometricPayload(request.body);
      const student = await findTenantStudent(request.tenantDb, idAluno, idCliente);

      if (!student) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

      // Gate LGPD (art. 11) — ver shared/consent.ts.
      await assertConsent(
        prisma,
        idAluno,
        'biometria_facial',
        'Consentimento de biometria facial nao registrado para este aluno.',
      );

      if (data.idAlunoArquivo) {
        const studentFile = await request.tenantDb.alunoArquivo.findFirst({
          where: { id: data.idAlunoArquivo, idAluno, boInativo: false },
          select: { id: true },
        });
        if (!studentFile) {
          throw new Error('Arquivo do aluno invalido para biometria facial.');
        }
      }

      const biometric = await prisma.$transaction(async (transaction) => {
        await transaction.alunoBiometriaFacial.updateMany({
          where: { idAluno, boInativo: false },
          data: { boInativo: true },
        });

        return transaction.alunoBiometriaFacial.create({
          data: {
            idAluno,
            idAlunoArquivo: data.idAlunoArquivo,
            dsModelo: data.dsModelo,
            dsProvider: data.dsProvider,
            dsSubject: data.dsSubject,
            dsExternalImageId: data.dsExternalImageId,
            // PII: embedding criptografado at-rest (AES-256-GCM).
            anEmbedding: encryptEmbedding(data.anEmbedding) ?? undefined,
            nrDimensoes: data.nrDimensoes,
            nrThreshold: data.nrThreshold,
            boInativo: false,
          },
        });
      });

      const { anEmbedding: _embedding, ...biometricResponse } = biometric;
      return reply.code(201).send(biometricResponse);
    } catch (error) {
      return reply.code(400).send({
        message:
          clientErrorMessage(error, 'Erro ao salvar biometria facial do aluno.'),
      });
    }
  });

  app.post<{
    Params: { id: string };
    Body: StudentFacialBiometricEnrollPayload;
  }>('/students/:id/facial-biometrics/enroll', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idAluno = Number(request.params.id);
      assertValidId(idAluno, 'Aluno invalido.');

      const parsedBody = facialBiometricEnrollBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.code(400).send({ message: 'Dados invalidos.' });
      }

      const idAlunoArquivo = optionalNumber(request.body.idAlunoArquivo);
      const nrThreshold = Number(
        request.body.nrThreshold ?? getComprefaceConfig().similarityThreshold,
      );

      if (!idAlunoArquivo) {
        throw new Error('Informe o arquivo do aluno para cadastrar a biometria facial.');
      }
      if (!Number.isFinite(nrThreshold) || nrThreshold <= 0 || nrThreshold > 1) {
        throw new Error('Informe um threshold entre 0 e 1.');
      }

      const student = await findTenantStudent(request.tenantDb, idAluno, idCliente);

      if (!student) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

      // Gate LGPD (art. 11): biometria facial e dado sensivel; sem consentimento
      // vigente, nao cadastra. Ver shared/consent.ts (kill-switch de transicao).
      await assertConsent(
        prisma,
        idAluno,
        'biometria_facial',
        'Consentimento de biometria facial nao registrado para este aluno.',
      );

      const studentFile = await request.tenantDb.alunoArquivo.findFirst({
        where: { id: idAlunoArquivo, idAluno, boInativo: false },
        select: { id: true, dsArquivo: true, anCaminho: true },
      });

      if (!studentFile) {
        throw new Error('Arquivo do aluno invalido para biometria facial.');
      }

      const { bucket } = getSupabaseConfig();
      const supabase = getSupabaseClient();
      const { data: fileData, error: downloadError } = await supabase.storage
        .from(bucket)
        .download(studentFile.anCaminho);

      if (downloadError) {
        throw new Error(downloadError.message);
      }

      const buffer = Buffer.from(await fileData.arrayBuffer());
      const subject = getStudentFacialSubject(idAluno);
      const comprefaceFace = await addComprefaceSubjectExample(
        subject,
        buffer,
        studentFile.dsArquivo,
      );

      const biometric = await prisma.$transaction(async (transaction) => {
        await transaction.alunoBiometriaFacial.updateMany({
          where: { idAluno, boInativo: false },
          data: { boInativo: true },
        });

        return transaction.alunoBiometriaFacial.create({
          data: {
            idAluno,
            idAlunoArquivo,
            dsModelo: 'compreface',
            dsProvider: 'compreface',
            dsSubject: comprefaceFace.subject || subject,
            dsExternalImageId: comprefaceFace.image_id,
            nrThreshold,
            boInativo: false,
          },
        });
      });

      return reply.code(201).send(biometric);
    } catch (error) {
      return reply.code(400).send({
        message:
          clientErrorMessage(error, 'Erro ao cadastrar biometria facial no CompreFace.'),
      });
    }
  });

  app.patch<{
    Params: { id: string; biometricId: string };
    Body: { boInativo?: number };
  }>('/students/:id/facial-biometrics/:biometricId/status', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idAluno = Number(request.params.id);
      const id = Number(request.params.biometricId);
      assertValidId(idAluno, 'Aluno invalido.');
      assertValidId(id, 'Biometria facial invalida.');

      const student = await findTenantStudent(request.tenantDb, idAluno, idCliente);
      if (!student) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

      const current = await request.tenantDb.alunoBiometriaFacial.findFirst({
        where: { id, idAluno },
        select: { id: true },
      });

      if (!current) {
        return reply.code(404).send({ message: 'Biometria facial nao encontrada.' });
      }

      const parsedBody = statusBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.code(400).send({ message: 'Dados invalidos.' });
      }

      return request.tenantDb.alunoBiometriaFacial.update({
        where: { id },
        data: { boInativo: toBool(request.body.boInativo) },
      });
    } catch (error) {
      return reply.code(400).send({
        message:
          clientErrorMessage(error, 'Erro ao alterar status da biometria facial.'),
      });
    }
  });

  // ---------------------------------------------------------------------------
  // Student related records
  // ---------------------------------------------------------------------------

  app.get<{
    Params: { id: string };
  }>('/students/:id/related/plans', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idAluno = Number(request.params.id);
      assertValidId(idAluno, 'Aluno invalido.');
      const parsedQuery = listLimitQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.code(400).send({ message: 'Parametros invalidos.' });
      }
      const student = await findTenantStudent(request.tenantDb, idAluno, idCliente);
      if (!student) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      const matriculas = await request.tenantDb.alunoPlano.findMany({
        where: { idAluno },
        take: clampLimit(parsedQuery.data.limit),
        include: {
          trancamentos: { where: { boInativo: false }, orderBy: { dtInicio: 'desc' } },
          motivoCancelamento: { select: { id: true, dsMotivoCancelamento: true } },
          plano: {
            include: {
              frequencia: true,
              planoAtividades: {
                where: { boInativo: false },
                include: { atividade: true },
                orderBy: { id: 'asc' },
              },
              planoProdutos: {
                where: { boInativo: false },
                include: { produto: true },
                orderBy: { id: 'asc' },
              },
              planoEmpresas: {
                where: { boInativo: false },
                include: { empresa: true },
                orderBy: { id: 'asc' },
              },
              planoValores: {
                where: { boInativo: false },
                include: { empresa: true },
                orderBy: { dtCadastro: 'desc' },
              },
            },
          },
          promocaoPlano: { include: { promocao: true } },
        },
        orderBy: { dtCadastro: 'desc' },
      });

      // Estado de trancamento resolvido AQUI, e nao no browser: a regra de qual
      // pausa vale hoje mora em shared/trancamento.ts e e a mesma que decide o
      // acesso na catraca. Deixar a tela recalcular abriria espaco para os dois
      // discordarem, e o gestor veria "ativo" para quem a catraca barra.
      const agora = new Date();
      return matriculas.map((matricula) => {
        const pausa = trancamentoVigente(matricula.trancamentos, agora);
        return {
          ...matricula,
          trancamentoVigente: pausa,
          trancado: pausa !== null,
        };
      });
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao listar planos do aluno.'),
      });
    }
  });

  app.get<{
    Params: { id: string };
  }>('/students/:id/related/payments', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idAluno = Number(request.params.id);
      assertValidId(idAluno, 'Aluno invalido.');
      const parsedQuery = listLimitQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.code(400).send({ message: 'Parametros invalidos.' });
      }
      const student = await findTenantStudent(request.tenantDb, idAluno, idCliente);
      if (!student) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      return request.tenantDb.pagamento.findMany({
        where: { alunoPlano: { idAluno } },
        take: clampLimit(parsedQuery.data.limit),
        include: {
          statusPagamento: { select: { id: true, dsStatusPagamento: true } },
          formaPagamento: { select: { id: true, dsFormaPagamento: true } },
          alunoPlano: { select: { id: true, plano: { select: { id: true, dsPlano: true } } } },
        },
        orderBy: [{ dtVencimento: 'asc' }, { dtCadastro: 'asc' }],
      });
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao listar pagamentos do aluno.'),
      });
    }
  });

  // Codigo de pagamento de UMA parcela.
  //
  // E POST porque, em conta de gateway, gerar o codigo CRIA uma cobranca no
  // provedor — escrita, nao leitura. A conta Pix propria nao grava nada, mas o
  // verbo segue o caso mais forte: um GET que as vezes escreve e a pior das
  // duas coisas.
  //
  // Fica sob /students/:id/ de proposito: assim o RBAC ja resolve os dois
  // papeis sem regra nova — o aluno alcanca o proprio caminho, e o funcionario
  // cai na regra de `payments` que ja existe para /related/payments.
  //
  // SOBRE A CHAVE PIX APARECER NO CODIGO: e o proposito dela — chave Pix existe
  // para ser entregue a quem vai pagar. A mascara do cadastro protege contra
  // leitura casual e enumeracao; isto e uma entrega deliberada, por cobranca, a
  // quem ja tem a cobranca.
  app.post<{
    Params: { id: string; paymentId: string };
  }>('/students/:id/related/payments/:paymentId/charge', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });

    try {
      const idAluno = Number(request.params.id);
      const idPagamento = Number(request.params.paymentId);
      assertValidId(idAluno, 'Aluno invalido.');
      assertValidId(idPagamento, 'Pagamento invalido.');

      const aluno = await request.tenantDb.aluno.findFirst({
        where: { id: idAluno, idCliente },
        select: { id: true, nmAluno: true, caCPF: true, anEmail: true, nrDDD: true, nrContato: true },
      });
      if (!aluno) return reply.code(404).send({ message: 'Registro nao encontrado.' });

      // A parcela tem que ser DESTE aluno — mensalidade ou compra no balcao.
      const pagamento = await request.tenantDb.pagamento.findFirst({
        where: {
          id: idPagamento,
          boInativo: false,
          OR: [{ alunoPlano: { idAluno } }, { produtoMovimentacao: { idAluno } }],
        },
        select: {
          id: true,
          idEmpresa: true,
          idStatusPagamento: true,
          idContaRecebimento: true,
          caTransacaoExterna: true,
          vlPrevisto: true,
          dtVencimento: true,
        },
      });
      if (!pagamento) return reply.code(404).send({ message: 'Cobranca nao encontrada.' });

      // Parcela quitada nao gera codigo. Sem esta trava, o aluno abriria a
      // tela, veria um Pix valido e pagaria de novo — e o estorno de Pix
      // depende de boa vontade de quem recebeu.
      const idPago = await getStatusIdByName(prisma, 'Pago');
      if (idPago !== null && pagamento.idStatusPagamento === idPago) {
        return reply.code(409).send({ message: 'Esta cobranca ja esta paga.' });
      }

      // Conta a usar: a que ja estiver amarrada a cobranca; senao a padrao da
      // filial; senao a padrao da rede. Nesta ordem porque o especifico manda
      // sobre o geral.
      const conta =
        (pagamento.idContaRecebimento
          ? await request.tenantDb.contaRecebimento.findFirst({
              where: { id: pagamento.idContaRecebimento, idCliente, boInativo: false },
            })
          : null) ??
        (await request.tenantDb.contaRecebimento.findFirst({
          where: {
            idCliente,
            boInativo: false,
            boPadrao: true,
            OR: [{ idEmpresa: pagamento.idEmpresa }, { idEmpresa: null }],
          },
          // Filial antes da rede: `nulls: 'last'` inverte o padrao do Postgres,
          // que traria a conta geral primeiro.
          orderBy: { idEmpresa: { sort: 'desc', nulls: 'last' } },
        }));

      if (!conta) {
        // Duas plateias na mesma rota. Para a equipe, o que resolve: onde
        // cadastrar. Para o aluno, mandar "cadastre em Contas de Recebimento"
        // seria pedir uma tela que ele nao alcanca — ele precisa saber o que
        // fazer agora, que e pagar de outro jeito.
        return reply.code(400).send({
          message:
            request.user.role === 'student'
              ? 'Pagamento por Pix indisponivel no momento. Fale com a recepcao da academia.'
              : 'Nenhuma conta de recebimento configurada para esta cobranca. Cadastre em Contas de Recebimento.',
        });
      }

      const cobranca = await buildChargeForPayment(prisma, conta, pagamento, aluno);
      if (!cobranca.codigo) {
        return reply.code(502).send({
          message: 'O provedor nao devolveu o codigo de pagamento. Tente novamente.',
        });
      }
      return cobranca;
    } catch (error) {
      request.log.error(error);
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao gerar a cobranca.'),
      });
    }
  });

  // O que a matricula do aluno da de direito, e quanto sobrou.
  app.get<{ Params: { id: string } }>('/students/:id/benefits', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idAluno = Number(request.params.id);
      assertValidId(idAluno, 'Aluno invalido.');

      const student = await findTenantStudent(request.tenantDb, idAluno, idCliente);
      if (!student) return reply.code(404).send({ message: 'Registro nao encontrado.' });

      return await carregarBeneficios(idAluno, idCliente);
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao listar beneficios do aluno.'),
      });
    }
  });

  // Entrega de um direito. Quem registra e a EQUIPE (o RBAC do aluno nao
  // libera esta rota): entregar e um ato do balcao, e deixar o aluno marcar
  // "peguei" esvaziaria o controle que a tabela existe para dar.
  app.post<{
    Params: { id: string; benefitId: string };
    Body: { dsObservacao?: string | null; idEmpresa?: number | string | null };
  }>('/students/:id/benefits/:benefitId/use', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idAluno = Number(request.params.id);
      const idPlanoBeneficio = Number(request.params.benefitId);
      assertValidId(idAluno, 'Aluno invalido.');
      assertValidId(idPlanoBeneficio, 'Beneficio invalido.');

      const student = await findTenantStudent(request.tenantDb, idAluno, idCliente);
      if (!student) return reply.code(404).send({ message: 'Registro nao encontrado.' });

      const idEmpresa = optionalNumber(request.body?.idEmpresa);
      if (idEmpresa) await assertTenantEmpresa(request.tenantDb, idEmpresa, idCliente);

      // Direito e estoque na MESMA transacao: se a baixa do produto falhar
      // (estoque insuficiente), o direito nao pode ficar marcado como usado.
      const registro = await prisma.$transaction(async (transaction) => {
        const estado = await carregarBeneficiosDoAluno(transaction, idAluno, idCliente);
        if (!estado.idAlunoPlano) throw new Error('Aluno sem matricula ativa.');

        return registrarUsoDeBeneficio(transaction, {
          estado,
          idPlanoBeneficio,
          idAluno,
          idEmpresa: idEmpresa ?? null,
          dsObservacao:
            typeof request.body?.dsObservacao === 'string'
              ? request.body.dsObservacao.trim().slice(0, 255) || null
              : null,
          idUsuario: request.user.sub ?? null,
        });
      });

      // Devolve o estado novo junto: a tela do balcao precisa mostrar
      // "resta 0 de 1" no mesmo instante, sem uma segunda chamada.
      return reply.code(201).send({
        registro,
        ...(await carregarBeneficios(idAluno, idCliente)),
      });
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao registrar a entrega do beneficio.'),
      });
    }
  });

  // Avisos do aluno. A geracao e a deduplicacao moram em shared/notifications.ts
  // — aqui so sincronizamos e devolvemos o que esta valendo, ja com o estado de
  // leitura. Sincronizar na leitura mantem a tela correta mesmo se o despacho
  // por email ainda nao rodou hoje.
  app.get<{
    Params: { id: string };
  }>('/students/:id/notifications', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idAluno = Number(request.params.id);
      assertValidId(idAluno, 'Aluno invalido.');

      const student = await findTenantStudent(request.tenantDb, idAluno, idCliente);
      if (!student) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

      const stored = await syncStudentNotifications(prisma, idAluno);

      // Formato compativel com quem ja consumia esta rota (type/title/message),
      // acrescido de id e leitura — assim o painel do aluno nao quebra.
      return stored.map((item) => ({
        id: item.id,
        type: item.cnSeveridade as 'danger' | 'warning' | 'info',
        title: item.dsTitulo,
        message: item.dsMensagem,
        cnTipo: item.cnTipo,
        dtLeitura: item.dtLeitura,
        dtCadastro: item.dtCadastro,
      }));
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao carregar avisos.'),
      });
    }
  });

  // Marcar um aviso como lido. O aluno faz isso na propria tela; o RBAC dele
  // libera exatamente esta rota.
  app.post<{
    Params: { id: string; notificationId: string };
  }>('/students/:id/notifications/:notificationId/read', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idAluno = Number(request.params.id);
      const idNotificacao = Number(request.params.notificationId);
      assertValidId(idAluno, 'Aluno invalido.');
      assertValidId(idNotificacao, 'Aviso invalido.');

      const student = await findTenantStudent(request.tenantDb, idAluno, idCliente);
      if (!student) return reply.code(404).send({ message: 'Registro nao encontrado.' });

      // A posse vem do proprio filtro: aviso de outro aluno nao e encontrado.
      const aviso = await request.tenantDb.notificacao.findFirst({
        where: { id: idNotificacao, idAluno },
        select: { id: true, dtLeitura: true },
      });
      if (!aviso) return reply.code(404).send({ message: 'Aviso nao encontrado.' });

      // Ja lido continua com a data original: reler nao reescreve quando foi a
      // primeira vez.
      if (aviso.dtLeitura) return aviso;

      return request.tenantDb.notificacao.update({
        where: { id: idNotificacao },
        data: { dtLeitura: new Date() },
      });
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao marcar o aviso como lido.'),
      });
    }
  });

  app.get<{
    Params: { id: string };
  }>('/students/:id/related/check-ins', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idAluno = Number(request.params.id);
      assertValidId(idAluno, 'Aluno invalido.');
      const parsedQuery = listLimitQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.code(400).send({ message: 'Parametros invalidos.' });
      }
      const student = await findTenantStudent(request.tenantDb, idAluno, idCliente);
      if (!student) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      return request.tenantDb.alunoCheckIn.findMany({
        where: { alunoPlano: { idAluno } },
        take: clampLimit(parsedQuery.data.limit),
        include: {
          alunoPlano: { include: { plano: true } },
          alunoTreinoSequencia: {
            include: {
              alunoTreino: {
                include: {
                  treino: true,
                  funcionario: true,
                },
              },
            },
          },
        },
        orderBy: { dtCadastro: 'desc' },
      });
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao listar check-ins do aluno.'),
      });
    }
  });

  app.get<{
    Params: { id: string };
    Querystring: { month?: string };
  }>('/students/:id/calendar', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idAluno = Number(request.params.id);
      assertValidId(idAluno, 'Aluno invalido.');

      const student = await findTenantStudent(request.tenantDb, idAluno, idCliente);
      if (!student) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

      const parsedQuery = calendarQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.code(400).send({ message: 'Parametros invalidos.' });
      }
      const month = parsedQuery.data.month ?? new Date().toISOString().slice(0, 7);

      const year = Number(month.slice(0, 4));
      const monthNumber = Number(month.slice(5, 7));
      const startsAt = new Date(year, monthNumber - 1, 1);
      const endsAt = new Date(year, monthNumber, 1);

      const [checkIns, activitySchedules, activityPresences] = await Promise.all([
        request.tenantDb.alunoCheckIn.findMany({
          where: {
            alunoPlano: { idAluno },
            idAtividadeAgenda: null,
            dtCadastro: { gte: startsAt, lt: endsAt },
            boInativo: false,
          },
          include: {
            alunoPlano: { include: { plano: true } },
            alunoTreinoSequencia: {
              include: {
                alunoTreino: {
                  include: {
                    treino: true,
                    funcionario: true,
                  },
                },
              },
            },
          },
          orderBy: { dtCadastro: 'asc' },
        }),
        request.tenantDb.alunoAtividadeAgenda.findMany({
          where: {
            idAluno,
            boInativo: false,
            atividadeAgenda: {
              boInativo: false,
              dtInicial: { gte: startsAt, lt: endsAt },
            },
          },
          include: {
            empresa: true,
            atividadeAgenda: {
              include: {
                atividade: true,
                categoria: true,
                empresa: true,
                funcionarioAtividadeAgendas: {
                  where: { boInativo: false },
                  include: { funcionario: true },
                },
              },
            },
          },
          orderBy: { dtCadastro: 'asc' },
        }),
        request.tenantDb.alunoCheckIn.findMany({
          where: {
            idAluno,
            idAtividadeAgenda: { not: null },
            boInativo: false,
            atividadeAgenda: { dtInicial: { gte: startsAt, lt: endsAt } },
          },
          include: {
            atividadeAgenda: {
              include: {
                atividade: true,
                categoria: true,
                empresa: true,
                funcionarioAtividadeAgendas: {
                  where: { boInativo: false },
                  include: { funcionario: true },
                },
              },
            },
          },
          orderBy: { dtCadastro: 'asc' },
        }),
      ]);

      return { checkIns, activitySchedules, activityPresences };
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao carregar calendario do aluno.'),
      });
    }
  });

  app.post<{
    Params: { id: string };
    Body: StudentActivityScheduleEnrollPayload;
  }>('/students/:id/activity-schedules/enroll', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idAluno = Number(request.params.id);
      assertValidId(idAluno, 'Aluno invalido.');
      const scheduleIds = normalizeScheduleIds(request.body);

      const student = await findTenantStudent(request.tenantDb, idAluno, idCliente);

      if (!student) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

      const created = await prisma.$transaction(async (transaction) => {
        const schedules = await transaction.atividadeAgenda.findMany({
          // Somente agendas do tenant: ids de outros clientes caem no erro de nao encontradas.
          where: { id: { in: scheduleIds }, boInativo: false, empresa: { idCliente } },
          include: {
            atividade: { select: { id: true, dsAtividade: true } },
            alunoAtividadeAgendas: {
              where: { boInativo: false },
              select: { idAluno: true },
            },
          },
          orderBy: { dtInicial: 'asc' },
        });

        if (schedules.length !== scheduleIds.length) {
          throw new Error('Uma ou mais aulas selecionadas nao foram encontradas.');
        }

        // O plano tem que incluir a atividade. Plano sem atividade marcada
        // continua dando acesso a todas — ver planCoverage.ts.
        await assertPlanoCobreAtividades(
          transaction,
          idAluno,
          schedules.map((schedule) => ({
            idAtividade: schedule.idAtividade,
            idEmpresa: schedule.idEmpresa,
            dsAtividade: schedule.atividade?.dsAtividade ?? null,
          })),
        );

        for (const schedule of schedules) {
          if (!schedule.dtInicial || !schedule.dtFinal) {
            throw new Error(`A agenda ${formatScheduleLabel(schedule)} esta sem periodo completo.`);
          }

          if (schedule.dtFinal < new Date()) {
            throw new Error(`A agenda ${formatScheduleLabel(schedule)} ja foi encerrada.`);
          }

          if (schedule.alunoAtividadeAgendas.some((enrollment) => enrollment.idAluno === idAluno)) {
            throw new Error(`Voce ja esta inscrito na agenda ${formatScheduleLabel(schedule)}.`);
          }

          if (schedule.qtAlunos !== null && schedule.alunoAtividadeAgendas.length >= schedule.qtAlunos) {
            throw new Error(`Nao ha vagas disponiveis na agenda ${formatScheduleLabel(schedule)}.`);
          }
        }

        for (let index = 0; index < schedules.length; index += 1) {
          for (let nextIndex = index + 1; nextIndex < schedules.length; nextIndex += 1) {
            const first = schedules[index]!;
            const second = schedules[nextIndex]!;
            if (schedulesOverlap(first, second)) {
              throw new Error(
                `As agendas selecionadas possuem conflito de horario: ${formatScheduleLabel(first)} e ${formatScheduleLabel(second)}.`,
              );
            }
          }
        }

        const selectedStart = schedules.reduce<Date | null>((current, schedule) => {
          if (!schedule.dtInicial) return current;
          return !current || schedule.dtInicial < current ? schedule.dtInicial : current;
        }, null);
        const selectedEnd = schedules.reduce<Date | null>((current, schedule) => {
          if (!schedule.dtFinal) return current;
          return !current || schedule.dtFinal > current ? schedule.dtFinal : current;
        }, null);

        if (!selectedStart || !selectedEnd) {
          throw new Error('Nao foi possivel validar o periodo das aulas selecionadas.');
        }

        const existingEnrollments = await transaction.alunoAtividadeAgenda.findMany({
          where: {
            idAluno,
            boInativo: false,
            atividadeAgenda: {
              boInativo: false,
              dtInicial: { lt: selectedEnd },
              dtFinal: { gt: selectedStart },
            },
          },
          include: {
            atividadeAgenda: {
              include: {
                atividade: { select: { dsAtividade: true } },
                alunoAtividadeAgendas: {
                  where: { boInativo: false },
                  select: { idAluno: true },
                },
              },
            },
          },
        });

        for (const selectedSchedule of schedules) {
          const conflict = existingEnrollments.find((enrollment) => {
            const existingSchedule = enrollment.atividadeAgenda;
            return existingSchedule && schedulesOverlap(selectedSchedule, existingSchedule);
          });

          if (conflict?.atividadeAgenda) {
            throw new Error(
              `Voce ja possui outra agenda nesse periodo: ${formatScheduleLabel(conflict.atividadeAgenda)}.`,
            );
          }
        }

        return Promise.all(
          schedules.map((schedule) =>
            transaction.alunoAtividadeAgenda.create({
              data: {
                idAluno,
                idEmpresa: schedule.idEmpresa,
                idAtividadeAgenda: schedule.id,
                boInativo: false,
              },
            }),
          ),
        );
      });

      return reply.code(201).send(created);
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao realizar inscricao na aula.'),
      });
    }
  });

  // Monta e valida os dados de uma avaliacao fisica. Usado no create e no
  // update para as duas rotas conferirem exatamente as mesmas posses — o
  // profissional e a foto precisam ser DESTE cliente e DESTE aluno.
  async function buildEvolutionData(db: PrismaClient, body: CompanyChildPayload,
    idAluno: number,
    idCliente: number,) {
    const idFuncionario = optionalNumber(body.idFuncionario);
    if (idFuncionario) {
      const employee = await db.funcionario.findFirst({
        where: { id: idFuncionario, empresa: { idCliente } },
        select: { id: true },
      });
      if (!employee) throw new Error('Profissional invalido.');
    }

    const idAlunoArquivo = optionalNumber(body.idAlunoArquivo);
    if (idAlunoArquivo) {
      // A foto tem que ser um arquivo DO PROPRIO ALUNO: sem esta conferencia,
      // apontar a avaliacao para o arquivo de outro aluno exibiria a foto dele
      // na tela de evolucao deste.
      const file = await db.alunoArquivo.findFirst({
        where: { id: idAlunoArquivo, idAluno },
        select: { id: true },
      });
      if (!file) throw new Error('Foto invalida para este aluno.');
    }

    const observacao = typeof body.dsObservacao === 'string' ? body.dsObservacao.trim() : '';

    return {
      idFuncionario,
      idAlunoArquivo,
      // Sem data informada vale hoje: a serie temporal ordena por esta coluna e
      // uma medicao sem data ficaria fora do grafico.
      dtAvaliacao: optionalDate(body.dtAvaliacao) ?? new Date(),
      // Todas estas colunas sao Decimal(5,2) — o teto real e 999,99, e nao
      // "numero decimal". Com `optionalNumber` puro, 1000 no peso ou "abc"
      // (que vira NaN) so falhavam no Postgres. numeroNaFaixa le a MESMA faixa
      // que o input do front usa em min/max/step, entao a mensagem e a mesma
      // dos dois lados. `vlAltura` esta em METROS: 175 seria 175 m.
      vlAltura: numeroNaFaixa(body.vlAltura, 'vlAltura', 'A altura'),
      vlPeso: numeroNaFaixa(body.vlPeso, 'vlPeso', 'O peso'),
      vlPercentualGordura: numeroNaFaixa(
        body.vlPercentualGordura,
        'vlPercentualGordura',
        'O percentual de gordura',
      ),
      vlMassaMagra: numeroNaFaixa(body.vlMassaMagra, 'vlMassaMagra', 'A massa magra'),
      vlCircPeitoral: numeroNaFaixa(body.vlCircPeitoral, 'vlCircPeitoral', 'O peitoral'),
      vlCircCintura: numeroNaFaixa(body.vlCircCintura, 'vlCircCintura', 'A cintura'),
      vlCircQuadril: numeroNaFaixa(body.vlCircQuadril, 'vlCircQuadril', 'O quadril'),
      vlCircBraco: numeroNaFaixa(body.vlCircBraco, 'vlCircBraco', 'O braco'),
      vlCircCoxa: numeroNaFaixa(body.vlCircCoxa, 'vlCircCoxa', 'A coxa'),
      dsObservacao: observacao || null,
      boInativo: toBool(body.boInativo),
    };
  }

  // O que o aluno de fato executou. Aceita ?idAlunoCheckIn= para a tela do
  // treino em andamento pedir so a sessao aberta; sem o filtro devolve o
  // historico, que e o que o professor le na ficha.
  app.get<{
    Params: { id: string };
    Querystring: { limit?: string; idAlunoCheckIn?: string };
  }>('/students/:id/related/executions', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idAluno = Number(request.params.id);
      assertValidId(idAluno, 'Aluno invalido.');
      const parsedQuery = executionQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.code(400).send({ message: 'Parametros invalidos.' });
      }
      const student = await findTenantStudent(request.tenantDb, idAluno, idCliente);
      if (!student) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

      const idAlunoCheckIn = parsedQuery.data.idAlunoCheckIn;

      return request.tenantDb.treinoExecucao.findMany({
        where: {
          boInativo: false,
          // A posse vem pelo check-in: so sessoes DESTE aluno entram, mesmo se
          // alguem passar um idAlunoCheckIn de outra pessoa.
          alunoCheckIn: { idAluno, ...(idAlunoCheckIn ? { id: idAlunoCheckIn } : {}) },
        },
        take: clampLimit(parsedQuery.data.limit),
        include: {
          unidadeMedida: true,
          alunoCheckIn: { select: { id: true, dtCadastro: true } },
          treinoExercicio: {
            select: {
              id: true,
              nrOrdem: true,
              nrSeries: true,
              nrRepeticoes: true,
              qtPeso: true,
              exercicio: { select: { id: true, dsExercicio: true } },
            },
          },
        },
        orderBy: [{ dtCadastro: 'desc' }],
      });
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao listar execucoes do treino.'),
      });
    }
  });

  // Motivo do cancelamento, validado contra a lookup. Reativacao limpa os dois
  // campos, entao o helper devolve nulos nesse caso.
  async function resolveCancellationReason(db: PrismaClient, body: { idMotivoCancelamento?: unknown; dsMotivoCancelamento?: unknown },
    cancelando: boolean,) {
    if (!cancelando) return { idMotivoCancelamento: null, dsMotivoCancelamento: null };

    const idMotivoCancelamento = optionalNumber(body.idMotivoCancelamento);
    if (idMotivoCancelamento) {
      const motivo = await db.motivoCancelamento.findUnique({
        where: { id: idMotivoCancelamento },
        select: { id: true },
      });
      if (!motivo) throw new Error('Motivo de cancelamento invalido.');
    }

    const dsMotivoCancelamento =
      typeof body.dsMotivoCancelamento === 'string' ? body.dsMotivoCancelamento.trim() : '';

    return {
      idMotivoCancelamento,
      dsMotivoCancelamento: dsMotivoCancelamento || null,
    };
  }

  // Extrato de fidelidade do aluno: saldo por filial + lancamentos.
  //
  // Devolve objeto (e nao array como os irmaos) porque saldo e extrato sao
  // duas leituras diferentes da mesma coisa e a tela precisa das duas. O saldo
  // e por EMPRESA — ver o racional em shared/loyalty.ts.
  app.get<{
    Params: { id: string };
  }>('/students/:id/related/points', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idAluno = Number(request.params.id);
      assertValidId(idAluno, 'Aluno invalido.');
      const parsedQuery = listLimitQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.code(400).send({ message: 'Parametros invalidos.' });
      }
      const student = await findTenantStudent(request.tenantDb, idAluno, idCliente);
      if (!student) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

      const lancamentos = await request.tenantDb.alunoPontuacao.findMany({
        where: { idAluno, boInativo: false },
        take: clampLimit(parsedQuery.data.limit),
        include: {
          empresa: { select: { id: true, dsEmpresa: true } },
          pontuacao: { select: { id: true, dsPontuacao: true } },
          produtoMovimentacao: {
            select: { id: true, produto: { select: { id: true, dsProduto: true } } },
          },
          alunoCheckIn: { select: { id: true, dtCadastro: true } },
        },
        orderBy: [{ dtCadastro: 'desc' }, { id: 'desc' }],
      });

      // Saldo = qtDisponivel do lancamento mais recente de cada filial. Como a
      // lista ja vem da mais nova para a mais antiga, o primeiro que aparecer
      // de cada empresa e o saldo dela.
      const saldos: Array<{ idEmpresa: number; dsEmpresa: string; qtDisponivel: number }> = [];
      const vistos = new Set<number>();
      for (const lancamento of lancamentos) {
        if (vistos.has(lancamento.idEmpresa)) continue;
        vistos.add(lancamento.idEmpresa);
        saldos.push({
          idEmpresa: lancamento.idEmpresa,
          dsEmpresa: lancamento.empresa?.dsEmpresa ?? '',
          qtDisponivel: lancamento.qtDisponivel,
        });
      }

      return { saldos, lancamentos };
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao listar pontos do aluno.'),
      });
    }
  });

  // Avaliacoes fisicas do aluno, da mais recente para a mais antiga. E a fonte
  // tanto da aba do professor quanto da tela de evolucao do aluno — o RBAC do
  // aluno ja libera GET sob o proprio /students/:id.
  app.get<{
    Params: { id: string };
  }>('/students/:id/related/evolutions', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idAluno = Number(request.params.id);
      assertValidId(idAluno, 'Aluno invalido.');
      const parsedQuery = listLimitQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.code(400).send({ message: 'Parametros invalidos.' });
      }
      const student = await findTenantStudent(request.tenantDb, idAluno, idCliente);
      if (!student) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      return request.tenantDb.alunoEvolucao.findMany({
        where: { idAluno },
        take: clampLimit(parsedQuery.data.limit),
        include: {
          funcionario: { select: { id: true, nmFuncionario: true } },
          alunoArquivo: { select: { id: true, dsArquivo: true, anCaminho: true } },
        },
        // dtAvaliacao e a data da MEDICAO; dtCadastro desempata lancamentos
        // feitos no mesmo dia.
        orderBy: [{ dtAvaliacao: 'desc' }, { dtCadastro: 'desc' }],
      });
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao listar avaliacoes do aluno.'),
      });
    }
  });

  app.get<{
    Params: { id: string };
  }>('/students/:id/related/trainings', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idAluno = Number(request.params.id);
      assertValidId(idAluno, 'Aluno invalido.');
      const parsedQuery = listLimitQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.code(400).send({ message: 'Parametros invalidos.' });
      }
      const student = await findTenantStudent(request.tenantDb, idAluno, idCliente);
      if (!student) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      return request.tenantDb.alunoTreino.findMany({
        where: { idAluno },
        take: clampLimit(parsedQuery.data.limit),
        include: {
          funcionario: true,
          treino: true,
          alunoTreinosSequencias: { where: { boInativo: false }, orderBy: { nrOrdem: 'asc' } },
        },
        orderBy: { dtCadastro: 'desc' },
      });
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao listar treinos do aluno.'),
      });
    }
  });

  app.post<{
    Params: { id: string; resource: string };
    Body: CompanyChildPayload;
  }>('/students/:id/related/:resource', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idAluno = Number(request.params.id);
      const resource = getStudentChildResourceConfig(request.params.resource);
      assertValidId(idAluno, 'Aluno invalido.');

      const parsedBody = childResourceBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.code(400).send({ message: 'Dados invalidos.' });
      }

      const student = await findTenantStudent(request.tenantDb, idAluno, idCliente);
      if (!student) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

      // O ALUNO abrindo a propria sessao de treino. Caminho separado do da
      // recepcao de proposito: o de baixo aceita do corpo a regra de pontuacao,
      // o tipo e a empresa, porque quem chama esta na academia. Vindo do app,
      // nada disso pode ser escolhido por quem pede.
      if (resource === 'check-ins' && request.user.role === 'student') {
        return await abrirSessaoDoApp(request, reply, { idAluno, idCliente });
      }

      if (resource === 'plans') {
        const idPlano = optionalNumber(request.body.idPlano);
        if (!idPlano) throw new Error('Selecione o plano.');

        // A matricula em si mora em shared/enrollment.ts: a mesma rotina serve
        // a ficha, a aprovacao de renovacao e a de troca de plano. Duplicar as
        // regras de valor, empresa e promocao aqui faria as tres divergirem.
        const record = await prisma.$transaction((transaction) =>
          enrollStudentInPlan({
            transaction,
            idCliente,
            idAluno,
            idPlano,
            idEmpresa: optionalNumber(request.body.idEmpresa),
            // Dia do mes: o teto e o calendario, nao o int4. Sem esta trava a
            // matricula aceitava dia 99 e a geracao de cobranca caia sempre no
            // ultimo dia do mes, sem ninguem perceber.
            nrDiaPagamento:
              numeroNaFaixa(request.body.nrDiaPagamento ?? 1, 'nrDiaPagamento', 'O dia de pagamento') ??
              1,
            qtParcelas: numeroNaFaixa(request.body.qtParcelas, 'qtParcelas', 'As parcelas'),
            idPromocaoPlano: optionalNumber(request.body.idPromocaoPlano),
            dtAdmissao: optionalDate(request.body.dtAdmissao),
            boInativo: toBool(request.body.boInativo),
          }),
        );

        return reply.code(201).send(record);
      }

      if (resource === 'trainings') {
        const idTreino = optionalNumber(request.body.idTreino);
        if (!idTreino) throw new Error('Selecione um treino.');

        const training = await request.tenantDb.treino.findFirst({
          // Treino do cliente. O filtro antigo aceitava tambem ficha sem
          // filial e sem aluno, que antes de tb_Treinos.idCliente era o
          // "modelo global" — e vinha de qualquer academia da instalacao.
          where: { id: idTreino, idCliente },
          select: { id: true },
        });
        if (!training) throw new Error('Treino invalido.');

        const idFuncionario = optionalNumber(request.body.idFuncionario);
        if (!idFuncionario) throw new Error('Profissional logado invalido.');

        const employee = await request.tenantDb.funcionario.findFirst({
          where: { id: idFuncionario, empresa: { idCliente } },
          select: { id: true },
        });
        if (!employee) throw new Error('Profissional invalido.');

        const nrOrdemSequencia = optionalNumber(request.body.nrOrdemSequencia);
        const record = await prisma.$transaction(async (transaction) => {
          const studentTraining = await transaction.alunoTreino.create({
            data: { idAluno, idFuncionario, idTreino, boInativo: toBool(request.body.boInativo) },
          });

          if (nrOrdemSequencia) {
            await transaction.alunoTreinoSequencia.create({
              data: { idAlunoTreino: studentTraining.id, nrOrdem: nrOrdemSequencia, boInativo: false },
            });
          }

          return transaction.alunoTreino.findUniqueOrThrow({
            where: { id: studentTraining.id },
            include: {
              funcionario: true,
              treino: true,
              alunoTreinosSequencias: { where: { boInativo: false }, orderBy: { nrOrdem: 'asc' } },
            },
          });
        });

        return reply.code(201).send(record);
      }

      if (resource === 'executions') {
        const idAlunoCheckIn = optionalNumber(request.body.idAlunoCheckIn);
        const idTreinoExercicio = optionalNumber(request.body.idTreinoExercicio);
        if (!idAlunoCheckIn) throw new Error('Informe a sessao de treino.');
        if (!idTreinoExercicio) throw new Error('Informe o exercicio.');

        // A sessao tem que ser DESTE aluno.
        const sessao = await request.tenantDb.alunoCheckIn.findFirst({
          where: { id: idAlunoCheckIn, idAluno },
          select: { id: true },
        });
        if (!sessao) throw new Error('Sessao de treino invalida.');

        // E o exercicio tem que pertencer a um treino visivel para o cliente.
        const exercicio = await request.tenantDb.treinoExercicio.findFirst({
          where: {
            id: idTreinoExercicio,
            OR: [
              { empresa: { idCliente } },
              { idEmpresa: null },
            ],
          },
          select: { id: true },
        });
        if (!exercicio) throw new Error('Exercicio invalido.');

        const dados = {
          nrSeriesFeitas: optionalNumber(request.body.nrSeriesFeitas) ?? 0,
          nrRepeticoes: optionalNumber(request.body.nrRepeticoes) ?? 0,
          vlCarga: optionalNumber(request.body.vlCarga),
          idUnidadeMedida: optionalNumber(request.body.idUnidadeMedida),
          boConcluido: toBool(request.body.boConcluido),
          dsObservacao:
            typeof request.body.dsObservacao === 'string'
              ? request.body.dsObservacao.trim() || null
              : null,
          boInativo: toBool(request.body.boInativo),
        };

        // Upsert e nao create: marcar a mesma serie de novo (dois toques no
        // botao, ou o aluno corrigindo a carga) atualiza a linha em vez de
        // empilhar duplicata. O unique no banco garante a mesma regra.
        const record = await request.tenantDb.treinoExecucao.upsert({
          where: {
            idAlunoCheckIn_idTreinoExercicio: { idAlunoCheckIn, idTreinoExercicio },
          },
          create: { idAlunoCheckIn, idTreinoExercicio, ...dados },
          update: dados,
          include: {
            unidadeMedida: true,
            treinoExercicio: {
              select: { id: true, exercicio: { select: { id: true, dsExercicio: true } } },
            },
          },
        });
        return reply.code(201).send(record);
      }

      if (resource === 'points') {
        const qtPontos = optionalNumber(request.body.qtPontos);
        if (!qtPontos) throw new Error('Informe a quantidade de pontos (use negativo para resgatar).');

        const idEmpresaPontos = optionalNumber(request.body.idEmpresa);
        if (!idEmpresaPontos) throw new Error('Informe a empresa do lancamento.');
        await assertTenantEmpresa(request.tenantDb, idEmpresaPontos, idCliente);

        const idPontuacaoLancamento = optionalNumber(request.body.idPontuacao);
        if (idPontuacaoLancamento) {
          const rule = await request.tenantDb.pontuacao.findFirst({
            where: { id: idPontuacaoLancamento, idEmpresa: idEmpresaPontos },
            select: { id: true },
          });
          if (!rule) throw new Error('Pontuacao invalida para esta empresa.');
        }

        const record = await registerPointsEntry(prisma, {
          idAluno,
          idEmpresa: idEmpresaPontos,
          idPontuacao: idPontuacaoLancamento,
          qtPontos,
          dsHistorico:
            typeof request.body.dsHistorico === 'string' ? request.body.dsHistorico : null,
        });
        return reply.code(201).send(record);
      }

      if (resource === 'evolutions') {
        const data = await buildEvolutionData(request.tenantDb, request.body, idAluno, idCliente);
        const record = await request.tenantDb.alunoEvolucao.create({
          data: { idAluno, ...data },
          include: {
            funcionario: { select: { id: true, nmFuncionario: true } },
            alunoArquivo: { select: { id: true, dsArquivo: true, anCaminho: true } },
          },
        });
        return reply.code(201).send(record);
      }

      let idAlunoPlano = optionalNumber(request.body.idAlunoPlano);

      if (!idAlunoPlano && resource === 'check-ins') {
        const activePlan = await request.tenantDb.alunoPlano.findFirst({
          where: { idAluno, boInativo: false },
          orderBy: { dtCadastro: 'desc' },
          select: { id: true },
        });
        idAlunoPlano = activePlan?.id ?? null;
      }

      if (!idAlunoPlano) throw new Error('Selecione um plano do aluno.');

      const studentPlan = await request.tenantDb.alunoPlano.findFirst({
        where: { id: idAlunoPlano, idAluno },
        select: { id: true },
      });
      if (!studentPlan) throw new Error('Plano do aluno invalido.');

      if (resource === 'payments') {
        const idEmpresa = optionalNumber(request.body.idEmpresa);
        if (!idEmpresa) throw new Error('Informe a empresa do pagamento.');
        await assertTenantEmpresa(request.tenantDb, idEmpresa, idCliente);
        const idStatusPagamento = optionalNumber(request.body.idStatusPagamento);
        if (!idStatusPagamento) throw new Error('Informe o status do pagamento.');
        const idProdutoMovimentacao = optionalNumber(request.body.idProdutoMovimentacao);
        if (idProdutoMovimentacao) {
          const movimentacao = await request.tenantDb.produtoMovimentacao.findFirst({
            where: { id: idProdutoMovimentacao, empresa: { idCliente } },
            select: { id: true },
          });
          if (!movimentacao) throw new Error('Movimentacao de produto invalida para este cliente.');
        }
        const record = await request.tenantDb.pagamento.create({
          data: {
            idEmpresa,
            idAlunoPlano,
            idProdutoMovimentacao,
            vlPrevisto: Number(request.body.vlPrevisto ?? request.body.vlPago ?? 0),
            vlPago: optionalNumber(request.body.vlPago),
            idStatusPagamento,
            idFormaPagamento: optionalNumber(request.body.idFormaPagamento),
            dtVencimento: optionalDate(request.body.dtVencimento),
            dtCompetencia: optionalDate(request.body.dtCompetencia),
            dtPagamento: optionalDate(request.body.dtPagamento) ?? new Date(),
            boInativo: toBool(request.body.boInativo),
          },
        });
        return reply.code(201).send(record);
      }

      const idAlunoTreinosSequencia = optionalNumber(request.body.idAlunoTreinosSequencia);

      if (idAlunoTreinosSequencia) {
        const sequence = await request.tenantDb.alunoTreinoSequencia.findFirst({
          where: {
            id: idAlunoTreinosSequencia,
            alunoTreino: { idAluno },
          },
          select: { id: true },
        });

        if (!sequence) {
          throw new Error('Sequencia de treino invalida para o aluno.');
        }
      }

      let idEmpresaCheckIn = optionalNumber(request.body.idEmpresa);

      if (idEmpresaCheckIn) {
        await assertTenantEmpresa(request.tenantDb, idEmpresaCheckIn, idCliente);
      } else {
        const empresa = await request.tenantDb.empresa.findFirst({
          where: { idCliente },
          select: { id: true },
        });
        idEmpresaCheckIn = empresa?.id ?? null;
      }

      if (!idEmpresaCheckIn) throw new Error('Informe a empresa do check-in.');

      // A unidade do check-in entra na conta: o plano precisa cobrir a filial
      // onde a pessoa esta entrando, e nao apenas estar em dia.
      const access = await getStudentAccessStatus(prisma, idAluno, idEmpresaCheckIn);
      if (!access.canAccess) {
        throw new Error(access.reason ?? 'Aluno sem acesso liberado para check-in.');
      }

      const idPontuacao = optionalNumber(request.body.idPontuacao);
      if (idPontuacao) {
        const pontuacao = await request.tenantDb.pontuacao.findFirst({
          where: { id: idPontuacao, empresa: { idCliente } },
          select: { id: true },
        });
        if (!pontuacao) throw new Error('Pontuacao invalida para este cliente.');
      }

      // Check-in e credito de pontos na MESMA transacao: ou o aluno entra e
      // pontua, ou nenhum dos dois acontece. Metade gravada aqui viraria
      // divergencia entre a frequencia e o extrato.
      const record = await prisma.$transaction(async (transaction) => {
        const created = await transaction.alunoCheckIn.create({
          data: {
            idEmpresa: idEmpresaCheckIn,
            idAluno,
            idAlunoPlano,
            idAlunoTreinosSequencia,
            idPontuacao,
            idTipoCheckIn: optionalNumber(request.body.idTipoCheckIn),
            boInativo: toBool(request.body.boInativo),
          },
        });

        await creditCheckInPoints(transaction, {
          idAluno,
          idEmpresa: idEmpresaCheckIn,
          idAlunoCheckIn: created.id,
          // Regra escolhida na tela vence a padrao da empresa.
          idPontuacaoEscolhida: idPontuacao,
        });

        return transaction.alunoCheckIn.findUniqueOrThrow({
          where: { id: created.id },
          include: {
            alunoPlano: { include: { plano: true } },
            alunoTreinoSequencia: {
              include: {
                alunoTreino: {
                  include: {
                    treino: true,
                    funcionario: true,
                  },
                },
              },
            },
          },
        });
      });
      return reply.code(201).send(record);
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao criar registro relacionado.'),
      });
    }
  });

  app.put<{
    Params: { id: string; resource: string; childId: string };
    Body: CompanyChildPayload;
  }>('/students/:id/related/:resource/:childId', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idAluno = Number(request.params.id);
      const childId = Number(request.params.childId);
      const resource = getStudentChildResourceConfig(request.params.resource);
      assertValidId(idAluno, 'Aluno invalido.');
      assertValidId(childId, 'Registro invalido.');

      const parsedBody = childResourceBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.code(400).send({ message: 'Dados invalidos.' });
      }

      const student = await findTenantStudent(request.tenantDb, idAluno, idCliente);
      if (!student) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

      if (resource === 'plans') {
        const current = await request.tenantDb.alunoPlano.findFirst({ where: { id: childId, idAluno }, select: { id: true } });
        if (!current) throw new Error('Plano do aluno invalido.');

        const idPlano = optionalNumber(request.body.idPlano);
        if (!idPlano) throw new Error('Selecione o plano.');
        const idPromocaoPlano = optionalNumber(request.body.idPromocaoPlano);
        if (idPromocaoPlano) {
          const promocaoPlano = await request.tenantDb.promocaoPlano.findFirst({
            where: { id: idPromocaoPlano, OR: [{ idEmpresa: null }, { empresa: { idCliente } }] },
            select: { id: true },
          });
          if (!promocaoPlano) throw new Error('Promocao invalida para este cliente.');
        }
        const boInativoPlano = toBool(request.body.boInativo);
        return request.tenantDb.alunoPlano.update({
          where: { id: childId },
          data: {
            idPlano,
            idPromocaoPlano,
            nrDiaPagamento:
              numeroNaFaixa(request.body.nrDiaPagamento ?? 1, 'nrDiaPagamento', 'O dia de pagamento') ??
              1,
            dtAdmissao: optionalDate(request.body.dtAdmissao) ?? new Date(),
            boInativo: boInativoPlano,
            // Cancelling records the cancellation date; reactivating clears it.
            dtEncerramento: boInativoPlano ? new Date() : null,
          },
        });
      }

      if (resource === 'trainings') {
        const current = await request.tenantDb.alunoTreino.findFirst({ where: { id: childId, idAluno }, select: { id: true } });
        if (!current) throw new Error('Treino do aluno invalido.');

        const idTreino = optionalNumber(request.body.idTreino);
        if (!idTreino) throw new Error('Selecione um treino.');

        const training = await request.tenantDb.treino.findFirst({
          // Treino do cliente. O filtro antigo aceitava tambem ficha sem
          // filial e sem aluno, que antes de tb_Treinos.idCliente era o
          // "modelo global" — e vinha de qualquer academia da instalacao.
          where: { id: idTreino, idCliente },
          select: { id: true },
        });
        if (!training) throw new Error('Treino invalido.');

        const idFuncionario = optionalNumber(request.body.idFuncionario);
        if (!idFuncionario) throw new Error('Profissional logado invalido.');

        const employee = await request.tenantDb.funcionario.findFirst({
          where: { id: idFuncionario, empresa: { idCliente } },
          select: { id: true },
        });
        if (!employee) throw new Error('Profissional invalido.');

        const nrOrdemSequencia = optionalNumber(request.body.nrOrdemSequencia);

        return prisma.$transaction(async (transaction) => {
          await transaction.alunoTreino.update({
            where: { id: childId },
            data: { idFuncionario, idTreino, boInativo: toBool(request.body.boInativo) },
          });

          if (nrOrdemSequencia) {
            const currentSequence = await transaction.alunoTreinoSequencia.findFirst({
              where: { idAlunoTreino: childId, boInativo: false },
              orderBy: { nrOrdem: 'asc' },
            });

            if (currentSequence) {
              await transaction.alunoTreinoSequencia.update({
                where: { id: currentSequence.id },
                data: { nrOrdem: nrOrdemSequencia },
              });
            } else {
              await transaction.alunoTreinoSequencia.create({
                data: { idAlunoTreino: childId, nrOrdem: nrOrdemSequencia, boInativo: false },
              });
            }
          }

          return transaction.alunoTreino.findUniqueOrThrow({
            where: { id: childId },
            include: {
              funcionario: true,
              treino: true,
              alunoTreinosSequencias: { where: { boInativo: false }, orderBy: { nrOrdem: 'asc' } },
            },
          });
        });
      }

      if (resource === 'points') throw new Error(EXTRATO_IMUTAVEL);
      if (resource === 'executions') throw new Error(EXECUCAO_VIA_POST);

      if (resource === 'evolutions') {
        const current = await request.tenantDb.alunoEvolucao.findFirst({
          where: { id: childId, idAluno },
          select: { id: true },
        });
        if (!current) throw new Error('Avaliacao invalida.');

        const data = await buildEvolutionData(request.tenantDb, request.body, idAluno, idCliente);
        return request.tenantDb.alunoEvolucao.update({
          where: { id: childId },
          data,
          include: {
            funcionario: { select: { id: true, nmFuncionario: true } },
            alunoArquivo: { select: { id: true, dsArquivo: true, anCaminho: true } },
          },
        });
      }

      const idAlunoPlano = optionalNumber(request.body.idAlunoPlano);
      if (!idAlunoPlano) throw new Error('Selecione um plano do aluno.');

      const studentPlan = await request.tenantDb.alunoPlano.findFirst({
        where: { id: idAlunoPlano, idAluno },
        select: { id: true },
      });
      if (!studentPlan) throw new Error('Plano do aluno invalido.');

      if (resource === 'payments') {
        const current = await request.tenantDb.pagamento.findFirst({
          where: { id: childId, alunoPlano: { idAluno } },
          select: { id: true, idEmpresa: true },
        });
        if (!current) throw new Error('Pagamento invalido.');

        const idEmpresa = optionalNumber(request.body.idEmpresa) ?? current.idEmpresa;
        if (!idEmpresa) throw new Error('Informe a empresa do pagamento.');
        await assertTenantEmpresa(request.tenantDb, idEmpresa, idCliente);
        const idStatusPagamento = optionalNumber(request.body.idStatusPagamento);
        if (!idStatusPagamento) throw new Error('Informe o status do pagamento.');
        const idProdutoMovimentacao = optionalNumber(request.body.idProdutoMovimentacao);
        if (idProdutoMovimentacao) {
          const movimentacao = await request.tenantDb.produtoMovimentacao.findFirst({
            where: { id: idProdutoMovimentacao, empresa: { idCliente } },
            select: { id: true },
          });
          if (!movimentacao) throw new Error('Movimentacao de produto invalida para este cliente.');
        }

        const status = await request.tenantDb.statusPagamento.findUnique({
          where: { id: idStatusPagamento },
          select: { dsStatusPagamento: true },
        });
        const isPaid = status?.dsStatusPagamento?.toLowerCase() === 'pago';

        const updated = await prisma.$transaction(async (transaction) => {
          const payment = await transaction.pagamento.update({
            where: { id: childId },
            data: {
              idEmpresa,
              idAlunoPlano,
              idProdutoMovimentacao,
              vlPrevisto: Number(request.body.vlPrevisto ?? request.body.vlPago ?? 0),
              vlPago: optionalNumber(request.body.vlPago),
              idStatusPagamento,
              idFormaPagamento: optionalNumber(request.body.idFormaPagamento),
              dtVencimento: optionalDate(request.body.dtVencimento),
              dtCompetencia: optionalDate(request.body.dtCompetencia),
              dtPagamento: optionalDate(request.body.dtPagamento) ?? new Date(),
              boInativo: toBool(request.body.boInativo),
            },
          });

          if (isPaid) {
            await generateNextRecurringPayment(transaction, payment.id);
          }

          return payment;
        });

        return updated;
      }

      const current = await request.tenantDb.alunoCheckIn.findFirst({
        where: { id: childId, alunoPlano: { idAluno } },
        select: { id: true },
      });
      if (!current) throw new Error('Check-in invalido.');

      const idEmpresaCheckIn = optionalNumber(request.body.idEmpresa);
      if (!idEmpresaCheckIn) throw new Error('Informe a empresa do check-in.');
      await assertTenantEmpresa(request.tenantDb, idEmpresaCheckIn, idCliente);

      const idAlunoTreinosSequencia = optionalNumber(request.body.idAlunoTreinosSequencia);
      if (idAlunoTreinosSequencia) {
        const sequence = await request.tenantDb.alunoTreinoSequencia.findFirst({
          where: { id: idAlunoTreinosSequencia, alunoTreino: { idAluno } },
          select: { id: true },
        });
        if (!sequence) throw new Error('Sequencia de treino invalida para o aluno.');
      }

      const idPontuacao = optionalNumber(request.body.idPontuacao);
      if (idPontuacao) {
        const pontuacao = await request.tenantDb.pontuacao.findFirst({
          where: { id: idPontuacao, empresa: { idCliente } },
          select: { id: true },
        });
        if (!pontuacao) throw new Error('Pontuacao invalida para este cliente.');
      }

      return request.tenantDb.alunoCheckIn.update({
        where: { id: childId },
        data: {
          idEmpresa: idEmpresaCheckIn,
          idAlunoPlano,
          idAlunoTreinosSequencia,
          idPontuacao,
          idTipoCheckIn: optionalNumber(request.body.idTipoCheckIn),
          boInativo: toBool(request.body.boInativo),
        },
      });
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao atualizar registro relacionado.'),
      });
    }
  });

  app.patch<{
    Params: { id: string; resource: string; childId: string };
    // O motivo so se aplica ao cancelamento de plano; os outros recursos
    // ignoram os campos extras.
    Body: {
      boInativo?: number;
      idMotivoCancelamento?: number | string | null;
      dsMotivoCancelamento?: string | null;
    };
  }>('/students/:id/related/:resource/:childId/status', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idAluno = Number(request.params.id);
      const childId = Number(request.params.childId);
      const resource = getStudentChildResourceConfig(request.params.resource);
      const parsedBody = statusBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.code(400).send({ message: 'Dados invalidos.' });
      }
      const boInativo = toBool(request.body.boInativo);
      assertValidId(idAluno, 'Aluno invalido.');
      assertValidId(childId, 'Registro invalido.');

      const student = await findTenantStudent(request.tenantDb, idAluno, idCliente);
      if (!student) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

      if (resource === 'plans') {
        const current = await request.tenantDb.alunoPlano.findFirst({ where: { id: childId, idAluno }, select: { id: true } });
        if (!current) throw new Error('Plano do aluno invalido.');

        const motivo = await resolveCancellationReason(request.tenantDb, request.body, boInativo);

        // Cancelar grava a data e o MOTIVO; reativar limpa os dois — um motivo
        // pendurado num plano ativo diria que o aluno saiu quando ele voltou.
        return request.tenantDb.alunoPlano.update({
          where: { id: childId },
          data: {
            boInativo,
            dtEncerramento: boInativo ? new Date() : null,
            idMotivoCancelamento: motivo.idMotivoCancelamento,
            dsMotivoCancelamento: motivo.dsMotivoCancelamento,
          },
        });
      }

      if (resource === 'trainings') {
        const current = await request.tenantDb.alunoTreino.findFirst({ where: { id: childId, idAluno }, select: { id: true } });
        if (!current) throw new Error('Treino do aluno invalido.');
        return request.tenantDb.alunoTreino.update({
          where: { id: childId },
          data: { boInativo },
          include: {
            funcionario: true,
            treino: true,
            alunoTreinosSequencias: { where: { boInativo: false }, orderBy: { nrOrdem: 'asc' } },
          },
        });
      }

      if (resource === 'points') throw new Error(EXTRATO_IMUTAVEL);
      if (resource === 'executions') throw new Error(EXECUCAO_VIA_POST);

      if (resource === 'evolutions') {
        const current = await request.tenantDb.alunoEvolucao.findFirst({
          where: { id: childId, idAluno },
          select: { id: true },
        });
        if (!current) throw new Error('Avaliacao invalida.');
        return request.tenantDb.alunoEvolucao.update({ where: { id: childId }, data: { boInativo } });
      }

      if (resource === 'payments') {
        const current = await request.tenantDb.pagamento.findFirst({
          where: { id: childId, alunoPlano: { idAluno } },
          select: { id: true },
        });
        if (!current) throw new Error('Pagamento invalido.');
        return request.tenantDb.pagamento.update({ where: { id: childId }, data: { boInativo } });
      }

      const current = await request.tenantDb.alunoCheckIn.findFirst({
        where: { id: childId, alunoPlano: { idAluno } },
        select: { id: true },
      });
      if (!current) throw new Error('Check-in invalido.');
      return request.tenantDb.alunoCheckIn.update({ where: { id: childId }, data: { boInativo } });
    } catch (error) {
      return reply.code(400).send({
        message:
          clientErrorMessage(error, 'Erro ao alterar status do registro relacionado.'),
      });
    }
  });
}
