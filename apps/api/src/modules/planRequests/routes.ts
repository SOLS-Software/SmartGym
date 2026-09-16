// Solicitacoes do aluno sobre a propria matricula: cancelar, renovar ou trocar.
//
// O aluno PEDE, a equipe resolve. Nao e acao unilateral de proposito — aviso
// previo, multa e fidelidade contratual sao regras de cada academia e nao
// existem no sistema; e, do outro lado, contratar sozinho sem confirmacao de
// pagamento produziria aluno devendo desde o primeiro dia.
//
// APROVAR EXECUTA. Cancelamento encerra o plano com o motivo que o aluno deu;
// renovacao e troca MATRICULAM e geram as parcelas, pela mesma rotina que a
// ficha usa (shared/enrollment.ts). O passo manual que existia entre "aprovado"
// e "matriculado" era onde as coisas se perdiam: a equipe aprovava e o aluno
// ficava esperando um plano que ninguem criou.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../shared/prisma.js';
import { assertValidId, optionalNumber } from '../../shared/normalize.js';
import { clientErrorMessage } from '../../shared/errors.js';
import { enrollStudentInPlan } from '../../shared/enrollment.js';
import { getStatusIdByName } from '../../shared/payments.js';
import type { Prisma } from '@smartgym/db';

/**
 * Encerra a matricula antiga e cancela o que ela ainda ia cobrar dali em diante.
 *
 * As DUAS coisas juntas, sempre. Encerrar sem limpar as parcelas deixa o aluno
 * pagando o plano velho e o novo pelo mesmo mes; limpar sem encerrar deixa duas
 * matriculas ativas, e a regra de acesso passa a ter duas respostas para "ele
 * pode treinar?".
 *
 * So mexe em parcela PENDENTE com vencimento a partir do corte: o que ja foi
 * pago continua pago, e o que venceu antes continua devido — o aluno usou
 * aquele periodo.
 */
async function closePlanAndVoidFuture(
  transaction: Prisma.TransactionClient,
  idAlunoPlano: number,
  corte: Date,
  motivo?: { idMotivoCancelamento: number | null; dsMotivoCancelamento: string | null },
) {
  await transaction.alunoPlano.update({
    where: { id: idAlunoPlano },
    data: {
      boInativo: true,
      dtEncerramento: corte,
      ...(motivo ?? {}),
    },
  });

  const idPendente = await getStatusIdByName(transaction, 'Pendente');
  if (idPendente === null) return;

  await transaction.pagamento.updateMany({
    where: {
      idAlunoPlano,
      idStatusPagamento: idPendente,
      boInativo: false,
      dtVencimento: { gte: corte },
    },
    data: { boInativo: true },
  });
}

const TIPOS = ['cancelamento', 'renovacao', 'troca'] as const;
const STATUS_PENDENTE = 'pendente';

const createSchema = z.object({
  // Ausente em contratacao de quem ainda nao tem plano nenhum.
  idAlunoPlano: z.union([z.number(), z.string()]).nullish(),
  cnTipo: z.enum(TIPOS),
  // Obrigatorio em 'troca': e o plano que o aluno quer.
  idPlanoDesejado: z.union([z.number(), z.string()]).nullish(),
  idMotivoCancelamento: z.union([z.number(), z.string()]).nullish(),
  dsObservacao: z.string().max(500).nullish(),
});

const resolveSchema = z.object({
  // 'aprovada' executa a acao pedida; 'recusada' so responde.
  cnStatus: z.enum(['aprovada', 'recusada']),
  dsResposta: z.string().max(500).nullish(),
});

const listQuerySchema = z.object({
  cnStatus: z.string().max(20).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

const INCLUDE = {
  motivoCancelamento: { select: { id: true, dsMotivoCancelamento: true } },
  planoDesejado: { select: { id: true, dsPlano: true } },
  aluno: { select: { id: true, nmAluno: true } },
  alunoPlano: {
    select: {
      id: true,
      idAluno: true,
      idPlano: true,
      nrDiaPagamento: true,
      qtParcelas: true,
      dtEncerramento: true,
      aluno: { select: { id: true, nmAluno: true } },
      plano: { select: { id: true, dsPlano: true } },
    },
  },
} as const;

export async function registerPlanRequestRoutes(app: FastifyInstance) {
  // Solicitacoes do proprio aluno (a equipe usa a rota de gestao abaixo).
  app.get<{ Params: { id: string } }>(
    '/students/:id/related/plan-requests',
    async (request, reply) => {
      const idCliente = request.user.idCliente;
      if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
      try {
        const idAluno = Number(request.params.id);
        assertValidId(idAluno, 'Aluno invalido.');

        const aluno = await request.tenantDb.aluno.findFirst({
          where: { id: idAluno, idCliente },
          select: { id: true },
        });
        if (!aluno) return reply.code(404).send({ message: 'Registro nao encontrado.' });

        return request.tenantDb.solicitacaoPlano.findMany({
          // Pedido sem matricula (contratacao) so se acha pelo idAluno; pedido
          // antigo pode ter idAluno nulo e se achar pelo plano. Os dois lados.
          where: {
            boInativo: false,
            OR: [{ idAluno }, { alunoPlano: { idAluno } }],
          },
          include: INCLUDE,
          orderBy: { dtCadastro: 'desc' },
        });
      } catch (error) {
        return reply.code(400).send({
          message: clientErrorMessage(error, 'Erro ao listar solicitacoes.'),
        });
      }
    },
  );

  app.post<{ Params: { id: string }; Body: unknown }>(
    '/students/:id/related/plan-requests',
    async (request, reply) => {
      const idCliente = request.user.idCliente;
      if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });

      const parsed = createSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ message: 'Dados invalidos.' });

      try {
        const idAluno = Number(request.params.id);
        assertValidId(idAluno, 'Aluno invalido.');

        const aluno = await request.tenantDb.aluno.findFirst({
          where: { id: idAluno, idCliente },
          select: { id: true },
        });
        if (!aluno) return reply.code(404).send({ message: 'Registro nao encontrado.' });

        const idAlunoPlano = optionalNumber(parsed.data.idAlunoPlano);
        if (idAlunoPlano) {
          // O plano tem que ser DESTE aluno: sem isto, um id adivinhado abriria
          // solicitacao na matricula de outra pessoa.
          const plano = await request.tenantDb.alunoPlano.findFirst({
            where: { id: idAlunoPlano, idAluno, aluno: { idCliente } },
            select: { id: true },
          });
          if (!plano) return reply.code(404).send({ message: 'Plano do aluno nao encontrado.' });
        }

        // Cancelar e renovar precisam de um plano; trocar/contratar, nao.
        if (!idAlunoPlano && parsed.data.cnTipo !== 'troca') {
          return reply.code(400).send({ message: 'Informe a matricula do pedido.' });
        }

        const idPlanoDesejado = optionalNumber(parsed.data.idPlanoDesejado);
        if (parsed.data.cnTipo === 'troca') {
          if (!idPlanoDesejado) {
            return reply.code(400).send({ message: 'Escolha o plano desejado.' });
          }
          // O plano tem que ser DESTE cliente — senao o aluno pediria um plano
          // de outra academia.
          const desejado = await request.tenantDb.plano.findFirst({
            where: { id: idPlanoDesejado, boInativo: false, idCliente },
            select: { id: true },
          });
          if (!desejado) return reply.code(404).send({ message: 'Plano nao encontrado.' });
        }

        // Um pedido pendente por tipo, POR ALUNO: clicar duas vezes no botao
        // nao vira duas linhas na fila da recepcao.
        const jaPendente = await request.tenantDb.solicitacaoPlano.findFirst({
          where: {
            cnTipo: parsed.data.cnTipo,
            cnStatus: STATUS_PENDENTE,
            boInativo: false,
            OR: [{ idAluno }, { alunoPlano: { idAluno } }],
          },
          select: { id: true },
        });
        if (jaPendente) {
          return reply.code(409).send({
            message: 'Ja existe uma solicitacao deste tipo aguardando resposta.',
          });
        }

        const idMotivoCancelamento = optionalNumber(parsed.data.idMotivoCancelamento);
        if (idMotivoCancelamento) {
          const motivo = await request.tenantDb.motivoCancelamento.findUnique({
            where: { id: idMotivoCancelamento },
            select: { id: true },
          });
          if (!motivo) throw new Error('Motivo de cancelamento invalido.');
        }

        const record = await request.tenantDb.solicitacaoPlano.create({
          data: {
            idAluno,
            idAlunoPlano,
            idPlanoDesejado,
            cnTipo: parsed.data.cnTipo,
            cnStatus: STATUS_PENDENTE,
            idMotivoCancelamento,
            dsObservacao: parsed.data.dsObservacao?.trim() || null,
          },
          include: INCLUDE,
        });

        return reply.code(201).send(record);
      } catch (error) {
        return reply.code(400).send({
          message: clientErrorMessage(error, 'Erro ao registrar solicitacao.'),
        });
      }
    },
  );

  // Fila da equipe: o que esta esperando resposta.
  app.get<{ Querystring: { cnStatus?: string; limit?: string } }>(
    '/plan-requests',
    async (request, reply) => {
      const idCliente = request.user.idCliente;
      if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });

      const parsed = listQuerySchema.safeParse(request.query);
      if (!parsed.success) return reply.code(400).send({ message: 'Parametros invalidos.' });

      try {
        return request.tenantDb.solicitacaoPlano.findMany({
          where: {
            boInativo: false,
            OR: [{ aluno: { idCliente } }, { alunoPlano: { aluno: { idCliente } } }],
            ...(parsed.data.cnStatus ? { cnStatus: parsed.data.cnStatus } : {}),
          },
          take: parsed.data.limit ?? 200,
          include: INCLUDE,
          // Pendentes primeiro: e uma fila de trabalho, nao um historico.
          orderBy: [{ cnStatus: 'asc' }, { dtCadastro: 'desc' }],
        });
      } catch (error) {
        return reply.code(400).send({
          message: clientErrorMessage(error, 'Erro ao listar solicitacoes.'),
        });
      }
    },
  );

  app.patch<{ Params: { id: string }; Body: unknown }>(
    '/plan-requests/:id',
    async (request, reply) => {
      const idCliente = request.user.idCliente;
      if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });

      const parsed = resolveSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ message: 'Dados invalidos.' });

      try {
        const id = Number(request.params.id);
        assertValidId(id, 'Solicitacao invalida.');

        const solicitacao = await request.tenantDb.solicitacaoPlano.findFirst({
          where: {
            id,
            OR: [{ aluno: { idCliente } }, { alunoPlano: { aluno: { idCliente } } }],
          },
          include: INCLUDE,
        });
        if (!solicitacao) return reply.code(404).send({ message: 'Registro nao encontrado.' });

        if (solicitacao.cnStatus !== STATUS_PENDENTE) {
          return reply.code(409).send({ message: 'Esta solicitacao ja foi respondida.' });
        }

        const aprovada = parsed.data.cnStatus === 'aprovada';
        const idAluno = solicitacao.idAluno ?? solicitacao.alunoPlano?.idAluno ?? null;

        if (aprovada && solicitacao.cnTipo !== 'cancelamento' && !idAluno) {
          return reply.code(400).send({ message: 'Solicitacao sem aluno identificado.' });
        }

        return await prisma.$transaction(async (transaction) => {
          // --- cancelamento: encerra com o motivo que o aluno deu ------------
          if (aprovada && solicitacao.cnTipo === 'cancelamento' && solicitacao.idAlunoPlano) {
            await closePlanAndVoidFuture(transaction, solicitacao.idAlunoPlano, new Date(), {
              idMotivoCancelamento: solicitacao.idMotivoCancelamento,
              dsMotivoCancelamento: solicitacao.dsObservacao,
            });
          }

          // --- renovacao: mesmo plano, matricula nova ------------------------
          if (aprovada && solicitacao.cnTipo === 'renovacao' && solicitacao.alunoPlano && idAluno) {
            const atual = solicitacao.alunoPlano;
            // A nova matricula comeca quando a atual termina; se ela ja venceu
            // (ou nao tem fim marcado), comeca hoje. Sem isto, renovar antes do
            // vencimento geraria duas cobrancas do mesmo mes.
            const fimAtual = atual.dtEncerramento ? new Date(atual.dtEncerramento) : null;
            const inicio = fimAtual && fimAtual > new Date() ? fimAtual : new Date();

            // A matricula anterior TEM que ser encerrada. Sem isto o aluno fica
            // com duas ativas e duas cobrancas do mesmo mes — foi exatamente o
            // que aconteceu no primeiro teste desta rota.
            await closePlanAndVoidFuture(transaction, atual.id, inicio);

            await enrollStudentInPlan({
              transaction,
              idCliente,
              idAluno,
              idPlano: atual.idPlano,
              nrDiaPagamento: atual.nrDiaPagamento,
              qtParcelas: atual.qtParcelas,
              dtAdmissao: inicio,
            });
          }

          // --- troca / contratacao ------------------------------------------
          if (aprovada && solicitacao.cnTipo === 'troca' && solicitacao.idPlanoDesejado && idAluno) {
            // Encerra o plano atual, quando ha um: manter os dois ativos faria
            // o aluno receber duas cobrancas e o acesso responder por qual?
            if (solicitacao.idAlunoPlano) {
              await closePlanAndVoidFuture(transaction, solicitacao.idAlunoPlano, new Date());
            }

            await enrollStudentInPlan({
              transaction,
              idCliente,
              idAluno,
              idPlano: solicitacao.idPlanoDesejado,
              nrDiaPagamento: solicitacao.alunoPlano?.nrDiaPagamento ?? 1,
            });
          }

          return transaction.solicitacaoPlano.update({
            where: { id },
            data: {
              cnStatus: parsed.data.cnStatus,
              dsResposta: parsed.data.dsResposta?.trim() || null,
              idFuncionarioResolucao: request.user.idFuncionario,
              dtResolucao: new Date(),
            },
            include: INCLUDE,
          });
        });
      } catch (error) {
        request.log.error(error);
        return reply.code(400).send({
          message: clientErrorMessage(error, 'Erro ao responder solicitacao.'),
        });
      }
    },
  );
}
