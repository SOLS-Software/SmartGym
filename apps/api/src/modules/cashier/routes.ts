// Caixa: confirmar que o dinheiro entrou.
//
// Antes disto, dar baixa era achar o aluno, abrir a ficha e editar um registro
// dentro dela. Com o Pix copia e cola no ar isso virou o gargalo: o aluno paga
// em dois toques e a academia leva cinco cliques e uma busca para registrar.
//
// A BAIXA E UM ATO, NAO UMA EDICAO. Por isso e uma rota propria e nao um PUT
// generico: ela grava status, data e valor de uma vez, e recusa o que nao faz
// sentido (baixa em cobranca ja paga). Um PUT aceita qualquer combinacao,
// inclusive as impossiveis.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../shared/prisma.js';
import { assertValidId, optionalNumber } from '../../shared/normalize.js';
import { clientErrorMessage } from '../../shared/errors.js';
import { getStatusIdByName } from '../../shared/payments.js';

const listQuerySchema = z.object({
  idEmpresa: z.coerce.number().int().optional(),
  /** Só o que já venceu. */
  vencidas: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

const settleSchema = z.object({
  idFormaPagamento: z.union([z.number(), z.string()]).nullish(),
  /** Ausente = o previsto. Informado = o que entrou de fato. */
  vlPago: z.union([z.number(), z.string()]).nullish(),
  dtPagamento: z.string().nullish(),
  idContaRecebimento: z.union([z.number(), z.string()]).nullish(),
});

export async function registerCashierRoutes(app: FastifyInstance) {
  // Cobrancas em aberto de todos os alunos, para a recepcao trabalhar sem
  // precisar saber de quem e cada Pix que caiu na conta.
  app.get<{ Querystring: { idEmpresa?: string; vencidas?: string; limit?: string } }>(
    '/payments/open',
    async (request, reply) => {
      const idCliente = request.user.idCliente;
      if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });

      const parsed = listQuerySchema.safeParse(request.query);
      if (!parsed.success) return reply.code(400).send({ message: 'Parametros invalidos.' });

      try {
        if (parsed.data.idEmpresa) {
          const empresa = await prisma.empresa.findFirst({
            where: { id: parsed.data.idEmpresa, idCliente },
            select: { id: true },
          });
          if (!empresa) return reply.code(404).send({ message: 'Empresa nao encontrada.' });
        }

        const idPendente = await getStatusIdByName(prisma, 'Pendente');

        const cobrancas = await prisma.pagamento.findMany({
          where: {
            boInativo: false,
            ...(idPendente ? { idStatusPagamento: idPendente } : {}),
            ...(parsed.data.idEmpresa
              ? { idEmpresa: parsed.data.idEmpresa }
              : { empresa: { idCliente } }),
            ...(parsed.data.vencidas ? { dtVencimento: { lt: new Date() } } : {}),
          },
          take: parsed.data.limit ?? 200,
          select: {
            id: true,
            idEmpresa: true,
            vlPrevisto: true,
            dtVencimento: true,
            alunoPlano: {
              select: {
                id: true,
                aluno: { select: { id: true, nmAluno: true } },
                plano: { select: { id: true, dsPlano: true } },
              },
            },
            produtoMovimentacao: {
              select: { id: true, aluno: { select: { id: true, nmAluno: true } } },
            },
            empresa: { select: { id: true, dsEmpresa: true } },
          },
          // Mais velha primeiro: quem esta devendo ha mais tempo e o que a
          // recepcao precisa ver antes.
          orderBy: [{ dtVencimento: 'asc' }, { id: 'asc' }],
        });

        return cobrancas.map((cobranca) => ({
          id: cobranca.id,
          idEmpresa: cobranca.idEmpresa,
          empresa: cobranca.empresa,
          vlPrevisto: Number(cobranca.vlPrevisto ?? 0),
          dtVencimento: cobranca.dtVencimento,
          // Mensalidade ou venda de balcao: a tela mostra as duas juntas
          // porque quem recebe o dinheiro nao separa uma da outra.
          aluno: cobranca.alunoPlano?.aluno ?? cobranca.produtoMovimentacao?.aluno ?? null,
          origem: cobranca.alunoPlano
            ? (cobranca.alunoPlano.plano?.dsPlano ?? 'Mensalidade')
            : 'Venda no balcao',
          vencida: cobranca.dtVencimento ? new Date(cobranca.dtVencimento) < new Date() : false,
        }));
      } catch (error) {
        return reply.code(400).send({
          message: clientErrorMessage(error, 'Erro ao listar as cobrancas em aberto.'),
        });
      }
    },
  );

  app.post<{ Params: { id: string }; Body: unknown }>(
    '/payments/:id/settle',
    async (request, reply) => {
      const idCliente = request.user.idCliente;
      if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });

      const parsed = settleSchema.safeParse(request.body ?? {});
      if (!parsed.success) return reply.code(400).send({ message: 'Dados invalidos.' });

      try {
        const id = Number(request.params.id);
        assertValidId(id, 'Cobranca invalida.');

        const cobranca = await prisma.pagamento.findFirst({
          where: { id, boInativo: false, empresa: { idCliente } },
          select: { id: true, idStatusPagamento: true, vlPrevisto: true },
        });
        if (!cobranca) return reply.code(404).send({ message: 'Cobranca nao encontrada.' });

        const [idPago, idPendente] = await Promise.all([
          getStatusIdByName(prisma, 'Pago'),
          getStatusIdByName(prisma, 'Pendente'),
        ]);
        if (idPago === null) {
          return reply.code(400).send({ message: 'Status "Pago" nao cadastrado.' });
        }

        // Baixa em cobranca ja paga e sempre engano — duas pessoas confirmando
        // o mesmo Pix, ou clique repetido. Recusar e melhor do que sobrescrever
        // a data do pagamento original.
        if (cobranca.idStatusPagamento === idPago) {
          return reply.code(409).send({ message: 'Esta cobranca ja esta paga.' });
        }
        if (idPendente !== null && cobranca.idStatusPagamento !== idPendente) {
          return reply.code(409).send({
            message: 'Esta cobranca nao esta em aberto. Ajuste pela ficha do aluno.',
          });
        }

        const idFormaPagamento = optionalNumber(parsed.data.idFormaPagamento);
        if (idFormaPagamento) {
          const forma = await prisma.formaPagamento.findUnique({
            where: { id: idFormaPagamento },
            select: { id: true },
          });
          if (!forma) return reply.code(404).send({ message: 'Forma de pagamento invalida.' });
        }

        const idContaRecebimento = optionalNumber(parsed.data.idContaRecebimento);
        if (idContaRecebimento) {
          const conta = await prisma.contaRecebimento.findFirst({
            where: { id: idContaRecebimento, idCliente },
            select: { id: true },
          });
          if (!conta) return reply.code(404).send({ message: 'Conta de recebimento invalida.' });
        }

        // Valor recebido: o informado, ou o previsto. Guardar o que entrou de
        // fato e o que permite descobrir depois que alguem pagou a menos.
        const vlPago = optionalNumber(parsed.data.vlPago) ?? Number(cobranca.vlPrevisto ?? 0);

        const dtPagamento = parsed.data.dtPagamento
          ? new Date(parsed.data.dtPagamento)
          : new Date();
        if (Number.isNaN(dtPagamento.getTime())) {
          return reply.code(400).send({ message: 'Data de pagamento invalida.' });
        }
        if (dtPagamento.getTime() > Date.now()) {
          return reply.code(400).send({ message: 'Nao e possivel dar baixa com data futura.' });
        }

        return await prisma.pagamento.update({
          where: { id },
          data: {
            idStatusPagamento: idPago,
            vlPago,
            dtPagamento,
            ...(idFormaPagamento ? { idFormaPagamento } : {}),
            ...(idContaRecebimento ? { idContaRecebimento } : {}),
            idUsuarioAlteracao: request.user.sub,
          },
          include: {
            statusPagamento: { select: { id: true, dsStatusPagamento: true } },
            formaPagamento: { select: { id: true, dsFormaPagamento: true } },
          },
        });
      } catch (error) {
        return reply.code(400).send({
          message: clientErrorMessage(error, 'Erro ao dar baixa na cobranca.'),
        });
      }
    },
  );

  // Desfazer uma baixa errada.
  //
  // Existe porque baixa errada acontece em balcao — confirma-se o Pix do aluno
  // parecido, ou clica-se na linha de cima. Sem desfazer, a correcao seria
  // editar o registro na ficha, que e exatamente o caminho que esta tela veio
  // eliminar. A cobranca VOLTA a ficar em aberto; nada e apagado.
  app.post<{ Params: { id: string } }>('/payments/:id/unsettle', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });

    try {
      const id = Number(request.params.id);
      assertValidId(id, 'Cobranca invalida.');

      const cobranca = await prisma.pagamento.findFirst({
        where: { id, boInativo: false, empresa: { idCliente } },
        select: { id: true, idStatusPagamento: true },
      });
      if (!cobranca) return reply.code(404).send({ message: 'Cobranca nao encontrada.' });

      const [idPago, idPendente] = await Promise.all([
        getStatusIdByName(prisma, 'Pago'),
        getStatusIdByName(prisma, 'Pendente'),
      ]);
      if (idPendente === null) {
        return reply.code(400).send({ message: 'Status "Pendente" nao cadastrado.' });
      }
      if (idPago !== null && cobranca.idStatusPagamento !== idPago) {
        return reply.code(409).send({ message: 'Esta cobranca nao esta paga.' });
      }

      return await prisma.pagamento.update({
        where: { id },
        data: {
          idStatusPagamento: idPendente,
          vlPago: null,
          dtPagamento: null,
          idUsuarioAlteracao: request.user.sub,
        },
      });
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao desfazer a baixa.'),
      });
    }
  });
}
