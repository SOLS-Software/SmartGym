// Webhook de pagamento.
//
// ESTA E A ROTA MAIS PERIGOSA DO SISTEMA: e publica e marca dinheiro como
// recebido. Sem defesa, quitar a propria mensalidade seria um `curl`.
//
// Tres camadas, e a terceira e a que realmente resolve:
//
//  1. TOKEN NA URL. Cada conta tem um endereco proprio e sorteado. Ele diz de
//     qual academia e o evento — sem depender do corpo — e ja filtra: sem token
//     valido o request nem chega ao processamento.
//
//  2. TOKEN NO HEADER, conferido em tempo constante. E o segredo que a academia
//     configura no painel do provedor.
//
//  3. NAO CONFIAR NO CORPO. O payload diz apenas QUAL cobranca mudou; o status
//     e o valor vem de uma consulta de volta ao provedor, autenticada com a
//     credencial da conta. Forjar o POST deixa de bastar — seria preciso fazer
//     o Asaas mentir.
//
// SEMPRE 200 quando o evento foi GRAVADO, mesmo que nao tenha virado baixa. O
// provedor reenvia o que nao foi confirmado, e responder erro num evento que ja
// esta no nosso banco produz tempestade de retry sem resolver nada. O que nao
// deu certo fica no log com o motivo.
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../shared/prisma.js';
import { decryptSecret } from '../../shared/secrets.js';
import { getStatusIdByName } from '../../shared/payments.js';
import {
  fetchAsaasPayment,
  isPaidStatus,
  parseAsaasEvent,
  tokensMatch,
  type AsaasEnvironment,
} from '../../shared/asaas.js';

/** O payload cru cabe na coluna; o que interessa vem sempre no comeco. */
const LIMITE_PAYLOAD = 4000;

export async function registerWebhookRoutes(app: FastifyInstance) {
  // Teto proprio: e rota publica que ESCREVE. Generoso o bastante para um lote
  // de eventos legitimo, baixo o bastante para nao servir de porta de inundacao.
  const webhookRateLimit = { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } };

  app.post<{ Params: { token: string }; Body: unknown }>(
    '/webhooks/payments/:token',
    webhookRateLimit,
    async (request, reply) => {
      const token = (request.params.token ?? '').trim();

      // Token curto demais nem consulta o banco: e varredura, nao evento.
      if (token.length < 16) {
        return reply.code(404).send({ message: 'Endereco invalido.' });
      }

      const conta = await prisma.contaRecebimento.findFirst({
        where: { caTokenWebhook: token, boInativo: false },
        select: {
          id: true,
          idCliente: true,
          cnProvedor: true,
          cnAmbiente: true,
          caCredencial: true,
        },
      });

      // 404 generico: dizer "conta existe mas token do header esta errado"
      // ajudaria quem esta tentando adivinhar.
      if (!conta) return reply.code(404).send({ message: 'Endereco invalido.' });

      // Camada 2: o segredo que a academia configurou no painel do provedor.
      // O Asaas manda em `asaas-access-token`.
      const cabecalho =
        request.headers['asaas-access-token'] ?? request.headers['x-webhook-token'];
      if (!tokensMatch(cabecalho, token)) {
        request.log.warn(
          { idConta: conta.id, ip: request.ip },
          'webhook com token de header invalido',
        );
        return reply.code(401).send({ message: 'Nao autorizado.' });
      }

      const evento = parseAsaasEvent(request.body);
      const payloadCru = JSON.stringify(request.body ?? {}).slice(0, LIMITE_PAYLOAD);

      // Deduplicacao pelo id do evento. Reenvio do mesmo evento responde 200
      // sem reprocessar — e o que impede a mesma parcela de receber duas baixas.
      if (evento.idEvento) {
        const jaVisto = await prisma.webhookEvento.findFirst({
          where: { idContaRecebimento: conta.id, caEventoExterno: evento.idEvento },
          select: { id: true, cnStatus: true },
        });
        if (jaVisto) {
          return reply.send({ recebido: true, repetido: true, status: jaVisto.cnStatus });
        }
      }

      const registro = await prisma.webhookEvento.create({
        data: {
          idContaRecebimento: conta.id,
          cnProvedor: conta.cnProvedor,
          caEventoExterno: evento.idEvento,
          cnTipoEvento: evento.tipo,
          caTransacaoExterna: evento.idCobranca,
          dsPayload: payloadCru,
          cnStatus: 'recebido',
        },
        select: { id: true },
      });

      /** Fecha o evento com um veredito legivel. Sempre grava o porque. */
      async function concluir(
        cnStatus: 'processado' | 'ignorado' | 'recusado',
        dsResultado: string,
        idPagamento?: number,
      ) {
        await prisma.webhookEvento.update({
          where: { id: registro.id },
          data: { cnStatus, dsResultado, idPagamento, dtProcessamento: new Date() },
        });
        return reply.send({ recebido: true, status: cnStatus });
      }

      try {
        if (evento.acao === 'ignorar') {
          return await concluir('ignorado', `Evento ${evento.tipo || 'sem tipo'} nao altera baixa.`);
        }
        if (!evento.idCobranca) {
          return await concluir('recusado', 'Evento sem id de cobranca.');
        }

        // Acha a nossa cobranca: pelo id do provedor (gravado na emissao) ou
        // pela referencia que mandamos junto — o id do proprio Pagamento.
        const idPorReferencia = Number(evento.referenciaExterna);
        const pagamento = await prisma.pagamento.findFirst({
          where: {
            boInativo: false,
            empresa: { idCliente: conta.idCliente },
            OR: [
              { caTransacaoExterna: evento.idCobranca },
              ...(Number.isInteger(idPorReferencia) && idPorReferencia > 0
                ? [{ id: idPorReferencia }]
                : []),
            ],
          },
          select: { id: true, idStatusPagamento: true, vlPrevisto: true },
        });

        if (!pagamento) {
          // Comum e esperado enquanto a EMISSAO nao existe: o Asaas avisa de
          // cobrancas que nao foram criadas por nos. Fica registrado para nao
          // virar mistério.
          return await concluir(
            'recusado',
            `Cobranca ${evento.idCobranca} nao encontrada neste cliente.`,
          );
        }

        // --- camada 3: confirmar com o provedor ---------------------------
        if (!conta.caCredencial) {
          return await concluir(
            'recusado',
            'Conta sem credencial: nao da para confirmar o evento no provedor.',
            pagamento.id,
          );
        }

        let confirmado;
        try {
          confirmado = await fetchAsaasPayment(
            decryptSecret(conta.caCredencial),
            evento.idCobranca,
            (conta.cnAmbiente === 'sandbox' ? 'sandbox' : 'producao') as AsaasEnvironment,
          );
        } catch (error) {
          // Falha de rede nao e recusa: o evento fica em 'recebido' e o
          // provedor reenvia. Marcar como recusado esconderia um pagamento real.
          request.log.error({ err: error, idEvento: registro.id }, 'falha ao confirmar no Asaas');
          await prisma.webhookEvento.update({
            where: { id: registro.id },
            data: {
              dsResultado: 'Nao foi possivel confirmar no provedor; aguardando reenvio.',
              idPagamento: pagamento.id,
            },
          });
          return reply.send({ recebido: true, status: 'recebido' });
        }

        if (!confirmado) {
          return await concluir(
            'recusado',
            'O provedor nao reconhece esta cobranca nesta conta.',
            pagamento.id,
          );
        }

        // --- estorno ------------------------------------------------------
        if (evento.acao === 'estornar') {
          const idPendente = await getStatusIdByName(prisma, 'Pendente');
          if (idPendente === null) {
            return await concluir('recusado', 'Status "Pendente" nao cadastrado.', pagamento.id);
          }
          await prisma.pagamento.update({
            where: { id: pagamento.id },
            data: { idStatusPagamento: idPendente, vlPago: null, dtPagamento: null },
          });
          return await concluir(
            'processado',
            `Cobranca voltou para o aberto (${evento.tipo}).`,
            pagamento.id,
          );
        }

        // --- confirmacao --------------------------------------------------
        if (!isPaidStatus(confirmado.status)) {
          return await concluir(
            'recusado',
            `O provedor diz que a cobranca esta ${confirmado.status}, nao paga.`,
            pagamento.id,
          );
        }

        const idPago = await getStatusIdByName(prisma, 'Pago');
        if (idPago === null) {
          return await concluir('recusado', 'Status "Pago" nao cadastrado.', pagamento.id);
        }
        if (pagamento.idStatusPagamento === idPago) {
          return await concluir('ignorado', 'Cobranca ja estava paga.', pagamento.id);
        }

        // Valor: o que o provedor confirma, nao o que o evento diz. Pagamento a
        // MENOR nao fecha a parcela — quanto se aceita de diferenca e regra de
        // negocio da academia, e inventa-la aqui seria dar quitacao que ninguem
        // autorizou. Fica registrado para uma pessoa decidir.
        const recebido = confirmado.value ?? confirmado.netValue ?? 0;
        const previsto = Number(pagamento.vlPrevisto ?? 0);
        if (recebido + 0.005 < previsto) {
          return await concluir(
            'recusado',
            `Valor recebido (${recebido}) menor que o previsto (${previsto}). Confira no Caixa.`,
            pagamento.id,
          );
        }

        await prisma.pagamento.update({
          where: { id: pagamento.id },
          data: {
            idStatusPagamento: idPago,
            vlPago: recebido,
            dtPagamento: new Date(),
            idContaRecebimento: conta.id,
            caTransacaoExterna: confirmado.id,
          },
        });

        return await concluir('processado', `Baixa automatica: ${evento.tipo}.`, pagamento.id);
      } catch (error) {
        request.log.error({ err: error, idEvento: registro.id }, 'erro ao processar webhook');
        // O evento esta gravado; devolver 200 evita retry sobre um erro nosso,
        // e o log guarda o que aconteceu.
        await prisma.webhookEvento.update({
          where: { id: registro.id },
          data: { cnStatus: 'recusado', dsResultado: 'Erro interno ao processar.', dtProcessamento: new Date() },
        });
        return reply.send({ recebido: true, status: 'recusado' });
      }
    },
  );

  // Eventos recebidos, para a academia enxergar o que chegou. Sem isto,
  // "o pagamento nao deu baixa" nao tem resposta.
  app.get<{ Querystring: { idConta?: string; limit?: string } }>(
    '/payment-accounts/events',
    async (request, reply) => {
      const idCliente = request.user.idCliente;
      if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });

      const idConta = Number(request.query.idConta);
      const limit = Math.min(Math.max(Number(request.query.limit) || 30, 1), 200);

      return prisma.webhookEvento.findMany({
        where: {
          contaRecebimento: { idCliente, ...(idConta > 0 ? { id: idConta } : {}) },
        },
        take: limit,
        orderBy: { dtCadastro: 'desc' },
        select: {
          id: true,
          cnTipoEvento: true,
          cnStatus: true,
          dsResultado: true,
          caTransacaoExterna: true,
          idPagamento: true,
          dtCadastro: true,
          contaRecebimento: { select: { id: true, dsConta: true } },
        },
      });
    },
  );
}
