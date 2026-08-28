// Trancar e destrancar matricula.
//
// TRANCAR NAO E CANCELAR — E ESSE O PONTO
//
// Antes disto, pausar so era possivel encerrando a matricula e abrindo outra na
// volta. `dtEncerramento` e o que a coorte e o churn dos Dashboards leem, entao
// cada viagem de dois meses entrava na evasao junto com quem foi para o
// concorrente, e o motivo de cancelamento ficava poluido. Aqui `dtEncerramento`
// NAO e tocado: o contrato continua vivo, so nao vale hoje.
//
// SAO ATOS, NAO EDICOES
//
// Rotas proprias (`/lock`, `/unlock`) e nao um PUT generico, pelo mesmo motivo
// da baixa no caixa: cada uma grava um conjunto coerente de uma vez (o periodo
// e o efeito na cobranca) e recusa o que nao faz sentido — trancar duas vezes,
// trancar contrato encerrado, voltar antes de sair. Um PUT aceitaria todas
// essas combinacoes.
//
// RBAC: `/students/...` cai em `students` (ver plugins/permissions.ts), entao
// trancar exige `students.write` — e trabalho de matricula, como deve ser.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../shared/prisma.js';
import { clientErrorMessage } from '../../shared/errors.js';
import { assertValidId } from '../../shared/normalize.js';
import { computeDueDate, getStatusIdByName } from '../../shared/payments.js';
import {
  referenciaDoDia,
  trancamentoCobre,
  trancamentoVigente,
} from '../../shared/trancamento.js';

const trancarSchema = z.object({
  /** Ausente = hoje. Retroativo e permitido: a recepcao costuma registrar depois. */
  dtInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dtPrevisaoRetorno: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  dsMotivo: z.string().max(255).nullish(),
});

const destrancarSchema = z.object({
  /** Ausente = hoje. */
  dtRetorno: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/**
 * Dia de calendario a partir de YYYY-MM-DD, como MEIA-NOITE UTC.
 *
 * As colunas sao `DATE` e o driver le e escreve nesse formato. Construir a data
 * em horario local gravaria 28/08 as 00h de Brasilia = 28/08 as 03h UTC, que o
 * Postgres trunca de volta para 28/08 — funciona por acidente a oeste de
 * Greenwich e quebra a leste. Em UTC, o que sai e exatamente o que volta.
 */
function comoData(texto: string | undefined | null, padrao: Date): Date {
  if (!texto) {
    return new Date(Date.UTC(padrao.getFullYear(), padrao.getMonth(), padrao.getDate()));
  }
  const [ano, mes, dia] = texto.split('-').map(Number);
  return new Date(Date.UTC(ano!, mes! - 1, dia!));
}

/** Confere que a matricula e do aluno e o aluno e do cliente. */
async function acharMatricula(idAluno: number, idAlunoPlano: number, idCliente: number) {
  return prisma.alunoPlano.findFirst({
    where: { id: idAlunoPlano, idAluno, aluno: { idCliente } },
    include: { trancamentos: { where: { boInativo: false }, orderBy: { dtInicio: 'desc' } } },
  });
}

export async function registerStudentLockRoutes(app: FastifyInstance) {
  // --- Historico de trancamentos da matricula -------------------------------
  app.get<{ Params: { id: string; idPlano: string } }>(
    '/students/:id/related/plans/:idPlano/locks',
    async (request, reply) => {
      const idCliente = request.user.idCliente;
      if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });

      try {
        const idAluno = Number(request.params.id);
        const idAlunoPlano = Number(request.params.idPlano);
        assertValidId(idAluno, 'Aluno invalido.');
        assertValidId(idAlunoPlano, 'Matricula invalida.');

        const matricula = await acharMatricula(idAluno, idAlunoPlano, idCliente);
        if (!matricula) return reply.code(404).send({ message: 'Matricula nao encontrada.' });

        const agora = new Date();
        return {
          idAlunoPlano,
          trancadoAgora: trancamentoVigente(matricula.trancamentos, agora) !== null,
          trancamentos: matricula.trancamentos.map((t) => ({
            ...t,
            vigente: trancamentoCobre(t, agora),
          })),
        };
      } catch (error) {
        return reply
          .code(400)
          .send({ message: clientErrorMessage(error, 'Erro ao listar trancamentos.') });
      }
    },
  );

  // --- Trancar --------------------------------------------------------------
  app.post<{ Params: { id: string; idPlano: string }; Body: unknown }>(
    '/students/:id/related/plans/:idPlano/lock',
    async (request, reply) => {
      const idCliente = request.user.idCliente;
      if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });

      const parsed = trancarSchema.safeParse(request.body ?? {});
      if (!parsed.success) return reply.code(400).send({ message: 'Parametros invalidos.' });

      try {
        const idAluno = Number(request.params.id);
        const idAlunoPlano = Number(request.params.idPlano);
        assertValidId(idAluno, 'Aluno invalido.');
        assertValidId(idAlunoPlano, 'Matricula invalida.');

        const matricula = await acharMatricula(idAluno, idAlunoPlano, idCliente);
        if (!matricula) return reply.code(404).send({ message: 'Matricula nao encontrada.' });

        const agora = new Date();
        const dtInicio = comoData(parsed.data.dtInicio, agora);
        const dtPrevisaoRetorno = parsed.data.dtPrevisaoRetorno
          ? comoData(parsed.data.dtPrevisaoRetorno, agora)
          : null;

        // Contrato encerrado nao tranca: ja acabou. Deixar passar criaria uma
        // pausa que nunca termina num contrato que nao existe mais.
        if (matricula.dtEncerramento && matricula.dtEncerramento <= agora) {
          return reply.code(400).send({ message: 'Matricula encerrada nao pode ser trancada.' });
        }
        // Comparacao por DIA: `dtAdmissao` e um timestamp (tem hora) e `dtInicio`
        // e meia-noite UTC. Comparar direto recusaria trancar no proprio dia da
        // matricula, que e raro mas legitimo.
        const diaDaAdmissao = matricula.dtAdmissao
          ? Date.UTC(
              matricula.dtAdmissao.getFullYear(),
              matricula.dtAdmissao.getMonth(),
              matricula.dtAdmissao.getDate(),
            )
          : null;
        if (diaDaAdmissao !== null && dtInicio.getTime() < diaDaAdmissao) {
          return reply
            .code(400)
            .send({ message: 'O trancamento nao pode comecar antes da admissao.' });
        }
        if (dtPrevisaoRetorno && dtPrevisaoRetorno <= dtInicio) {
          return reply
            .code(400)
            .send({ message: 'A previsao de retorno deve ser depois do inicio.' });
        }
        // Ja trancado (hoje ou na data pedida): recusar em vez de empilhar. Duas
        // pausas sobrepostas fariam `trancamentoVigente` escolher uma
        // arbitrariamente, e o motivo mostrado na catraca viraria loteria.
        // `dtInicio` e um dia armazenado (UTC); a regra compara referencias
        // locais. Sem converter, a pergunta virava "ja esta trancado ONTEM?" e
        // a mesma matricula aceitava dois trancamentos sobrepostos.
        if (trancamentoVigente(matricula.trancamentos, referenciaDoDia(dtInicio))) {
          return reply.code(409).send({ message: 'Esta matricula ja esta trancada no periodo.' });
        }

        const resultado = await prisma.$transaction(async (tx) => {
          const criado = await tx.alunoPlanoTrancamento.create({
            data: {
              idAlunoPlano,
              dtInicio,
              dtPrevisaoRetorno,
              dsMotivo: parsed.data.dsMotivo ?? null,
              idUsuarioCadastro: request.user.sub,
            },
          });

          // Suspende a cobranca do periodo parado. Mesmo idioma do
          // cancelamento (planRequests/closePlanAndVoidFuture): so mexe em
          // parcela PENDENTE que vence DENTRO da pausa. O que ja foi pago
          // continua pago, e o que venceu antes continua devido — aquele
          // periodo o aluno usou.
          const idPendente = await getStatusIdByName(tx, 'Pendente');
          let suspensas = 0;
          if (idPendente !== null) {
            const { count } = await tx.pagamento.updateMany({
              where: {
                idAlunoPlano,
                idStatusPagamento: idPendente,
                boInativo: false,
                dtVencimento: {
                  gte: dtInicio,
                  ...(dtPrevisaoRetorno ? { lt: dtPrevisaoRetorno } : {}),
                },
              },
              data: { boInativo: true },
            });
            suspensas = count;
          }

          return { criado, suspensas };
        });

        return reply.code(201).send({
          trancamento: resultado.criado,
          parcelasSuspensas: resultado.suspensas,
        });
      } catch (error) {
        request.log.error(error);
        return reply
          .code(400)
          .send({ message: clientErrorMessage(error, 'Erro ao trancar a matricula.') });
      }
    },
  );

  // --- Destrancar -----------------------------------------------------------
  app.post<{ Params: { id: string; idPlano: string }; Body: unknown }>(
    '/students/:id/related/plans/:idPlano/unlock',
    async (request, reply) => {
      const idCliente = request.user.idCliente;
      if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });

      const parsed = destrancarSchema.safeParse(request.body ?? {});
      if (!parsed.success) return reply.code(400).send({ message: 'Parametros invalidos.' });

      try {
        const idAluno = Number(request.params.id);
        const idAlunoPlano = Number(request.params.idPlano);
        assertValidId(idAluno, 'Aluno invalido.');
        assertValidId(idAlunoPlano, 'Matricula invalida.');

        const matricula = await acharMatricula(idAluno, idAlunoPlano, idCliente);
        if (!matricula) return reply.code(404).send({ message: 'Matricula nao encontrada.' });

        const agora = new Date();
        const dtRetorno = comoData(parsed.data.dtRetorno, agora);

        // Fecha a pausa que cobre HOJE; se nao houver, a que cobre a data de
        // retorno informada (retorno retroativo).
        const pausa =
          trancamentoVigente(matricula.trancamentos, agora) ??
          trancamentoVigente(matricula.trancamentos, referenciaDoDia(dtRetorno));
        if (!pausa) {
          return reply.code(409).send({ message: 'Esta matricula nao esta trancada.' });
        }
        // Retorno NO MESMO DIA do inicio e permitido de proposito: e como se
        // desfaz um trancamento lancado por engano. A regra ja trata esse caso
        // sozinha (`dtRetorno > hoje` e falso quando sao o mesmo dia, entao a
        // pausa nao cobre nada), e a linha fica no historico com zero dias — o
        // que e a verdade do que aconteceu. Sem isto, quem errasse o botao
        // ficava preso: nao dava para destrancar antes do dia seguinte.
        if (dtRetorno < pausa.dtInicio) {
          return reply
            .code(400)
            .send({ message: 'O retorno nao pode ser antes do inicio do trancamento.' });
        }

        const resultado = await prisma.$transaction(async (tx) => {
          const fechado = await tx.alunoPlanoTrancamento.update({
            where: { id: pausa.id },
            data: { dtRetorno, idUsuarioAlteracao: request.user.sub },
          });

          // Na volta, a cobranca precisa voltar tambem.
          //
          // As parcelas suspensas NAO sao reativadas: elas cobriam o periodo
          // parado, que o aluno nao usou. O que se cria e UMA parcela nova, a
          // partir do retorno. Sem isto o aluno voltaria a treinar sem nenhuma
          // cobranca em aberto, e a geracao recorrente nao o salvaria — ela e
          // disparada pela BAIXA de uma parcela, e nao havia nenhuma.
          const idPendente = await getStatusIdByName(tx, 'Pendente');
          let novaParcela: { id: number; dtVencimento: Date | null } | null = null;

          if (idPendente !== null) {
            const jaPendente = await tx.pagamento.count({
              where: { idAlunoPlano, idStatusPagamento: idPendente, boInativo: false },
            });

            if (jaPendente === 0) {
              // Valor e filial vem da ultima cobranca real desta matricula: e o
              // que o aluno vinha pagando, incluindo desconto de promocao que
              // ainda valha. Consultar o catalogo de novo poderia reajustar o
              // preco no meio do contrato sem ninguem ter decidido isso.
              const ultima = await tx.pagamento.findFirst({
                where: { idAlunoPlano },
                orderBy: [{ dtVencimento: 'desc' }, { id: 'desc' }],
                select: { idEmpresa: true, vlPrevisto: true },
              });

              if (ultima) {
                const vencimento = computeDueDate(dtRetorno, matricula.nrDiaPagamento, 0);
                const criada = await tx.pagamento.create({
                  data: {
                    idEmpresa: ultima.idEmpresa,
                    idAlunoPlano,
                    idStatusPagamento: idPendente,
                    vlPrevisto: ultima.vlPrevisto,
                    dtVencimento: vencimento,
                    dtCompetencia: new Date(
                      vencimento.getFullYear(),
                      vencimento.getMonth(),
                      1,
                    ),
                    idUsuarioCadastro: request.user.sub,
                  },
                  select: { id: true, dtVencimento: true },
                });
                novaParcela = criada;
              }
            }
          }

          return { fechado, novaParcela };
        });

        return {
          trancamento: resultado.fechado,
          parcelaGerada: resultado.novaParcela,
        };
      } catch (error) {
        request.log.error(error);
        return reply
          .code(400)
          .send({ message: clientErrorMessage(error, 'Erro ao destrancar a matricula.') });
      }
    },
  );
}
