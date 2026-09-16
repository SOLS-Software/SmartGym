// Relatorios consolidados que o web nao consegue montar sozinho.
//
// As demais telas de relatorio agregam no browser a partir das listagens, o que
// funciona enquanto o volume e pequeno. Financeiro nao da: exigiria baixar
// pagamento por pagamento de todos os alunos so para somar. Aqui a soma sai do
// banco e trafega o resultado.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../shared/prisma.js';
import { clientErrorMessage } from '../../shared/errors.js';
import { getStatusIdByName } from '../../shared/payments.js';
import { registerOverviewRoutes } from './overview.js';
import { registerDashboardRoutes } from './dashboards.js';
import { registerSecuritySignalRoutes } from './security.js';
import { matriculaAtivaWhere } from './vigencia.js';

const inactiveQuerySchema = z.object({
  idEmpresa: z.coerce.number().int().optional(),
  // Sem `days`, vale o corte configurado no cliente (Cliente.nrDiasSemCheckIn).
  days: z.coerce.number().int().min(1).max(365).optional(),
});

const financialQuerySchema = z.object({
  idEmpresa: z.coerce.number().int().optional(),
  // Datas ISO (YYYY-MM-DD). Sem periodo, o padrao e o mes corrente.
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function registerReportRoutes(app: FastifyInstance) {
  await registerOverviewRoutes(app);
  await registerDashboardRoutes(app);
  registerSecuritySignalRoutes(app);

  app.get<{
    Querystring: { idEmpresa?: string; from?: string; to?: string };
  }>('/reports/financial', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });

    const parsed = financialQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ message: 'Parametros invalidos.' });

    try {
      const hoje = new Date();
      const inicio = parsed.data.from ? new Date(`${parsed.data.from}T00:00:00`) : startOfMonth(hoje);
      const fim = parsed.data.to ? new Date(`${parsed.data.to}T23:59:59.999`) : endOfMonth(hoje);

      // Escopo de tenant: a empresa informada precisa ser do cliente; sem ela,
      // vale a rede inteira do cliente.
      if (parsed.data.idEmpresa) {
        const empresa = await request.tenantDb.empresa.findFirst({
          where: { id: parsed.data.idEmpresa, idCliente },
          select: { id: true },
        });
        if (!empresa) return reply.code(404).send({ message: 'Empresa nao encontrada.' });
      }

      const escopoEmpresa = parsed.data.idEmpresa
        ? { idEmpresa: parsed.data.idEmpresa }
        : { empresa: { idCliente } };

      const [idPago, idPendente] = await Promise.all([
        getStatusIdByName(prisma, 'Pago'),
        getStatusIdByName(prisma, 'Pendente'),
      ]);

      const base = { boInativo: false, ...escopoEmpresa };

      const [recebidos, aReceber, vencidos, matriculasAtivas] = await Promise.all([
        // Recebido: o que foi pago DENTRO do periodo (data de pagamento, nao de
        // vencimento) — e o dinheiro que entrou no caixa nesses dias.
        request.tenantDb.pagamento.findMany({
          where: {
            ...base,
            ...(idPago ? { idStatusPagamento: idPago } : {}),
            dtPagamento: { gte: inicio, lte: fim },
          },
          select: { vlPago: true, vlPrevisto: true, idAlunoPlano: true, idProdutoMovimentacao: true },
        }),
        // A receber: pendente com vencimento no periodo.
        request.tenantDb.pagamento.findMany({
          where: {
            ...base,
            ...(idPendente ? { idStatusPagamento: idPendente } : {}),
            dtVencimento: { gte: inicio, lte: fim },
          },
          select: { vlPrevisto: true },
        }),
        // Inadimplencia: pendente ja vencido, independente do periodo — divida
        // velha nao some do relatorio so porque o filtro e do mes corrente.
        request.tenantDb.pagamento.findMany({
          where: {
            ...base,
            ...(idPendente ? { idStatusPagamento: idPendente } : {}),
            dtVencimento: { lt: new Date() },
          },
          select: { vlPrevisto: true, idAlunoPlano: true },
        }),
        // Denominador do ARPU: matricula ATIVA, nao apenas vigente. Quem esta
        // com o plano trancado nao esta pagando, e conta-lo derrubaria a receita
        // por aluno sem que a academia tivesse perdido nada.
        //
        // Escopo de cliente, nao de filial: matricula nao tem idEmpresa (ver o
        // comentario de escopo em ./overview.ts). Com uma filial selecionada, a
        // receita e da filial e a base e da rede — por isso o ARPU so e
        // devolvido quando o relatorio olha a rede inteira.
        parsed.data.idEmpresa
          ? Promise.resolve(0)
          : request.tenantDb.alunoPlano.count({ where: matriculaAtivaWhere(idCliente, new Date()) }),
      ]);

      const somaPago = (linhas: Array<{ vlPago?: unknown; vlPrevisto?: unknown }>) =>
        linhas.reduce((total, linha) => total + toNumber(linha.vlPago ?? linha.vlPrevisto), 0);

      const mensalidades = recebidos.filter((linha) => linha.idAlunoPlano !== null);
      const balcao = recebidos.filter((linha) => linha.idProdutoMovimentacao !== null);

      const totalRecebido = somaPago(recebidos);
      const totalMensalidades = somaPago(mensalidades);
      const totalBalcao = somaPago(balcao);

      return {
        periodo: { inicio, fim },
        recebido: {
          total: totalRecebido,
          mensalidades: totalMensalidades,
          balcao: totalBalcao,
          quantidade: recebidos.length,
          qtMensalidades: mensalidades.length,
          qtBalcao: balcao.length,
          // Ticket medio SO de mensalidade.
          //
          // Antes era `recebido ÷ quantidade`, misturando as duas coisas que a
          // propria rota separa duas linhas acima: uma creatina de R$ 90 entrava
          // na media junto com o plano anual e puxava o "ticket" para baixo. O
          // numero caia quando a loja vendia bem — exatamente ao contrario do
          // que o gestor concluia ao ler.
          ticketMedioMensalidade:
            mensalidades.length > 0 ? totalMensalidades / mensalidades.length : 0,
          ticketMedioBalcao: balcao.length > 0 ? totalBalcao / balcao.length : 0,
        },
        // Receita por aluno: a conta que se compara mes a mes sem depender de
        // quantas parcelas cairam no periodo. Nula quando o relatorio esta
        // filtrado por filial (ver a consulta acima) ou quando nao ha base.
        arpu:
          matriculasAtivas > 0
            ? { valor: totalRecebido / matriculasAtivas, matriculasAtivas }
            : null,
        aReceber: {
          total: aReceber.reduce((soma, linha) => soma + toNumber(linha.vlPrevisto), 0),
          quantidade: aReceber.length,
        },
        inadimplencia: {
          total: vencidos.reduce((soma, linha) => soma + toNumber(linha.vlPrevisto), 0),
          quantidade: vencidos.length,
          // Alunos distintos devendo: 40 parcelas vencidas podem ser 3 pessoas.
          alunos: new Set(vencidos.map((linha) => linha.idAlunoPlano).filter(Boolean)).size,
        },
      };
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao montar o relatorio financeiro.'),
      });
    }
  });

  // Motivos pelos quais os alunos sairam, no periodo. A pergunta que o dado de
  // cancelamento existe para responder.
  app.get<{
    Querystring: { from?: string; to?: string };
  }>('/reports/cancellations', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });

    const parsed = financialQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ message: 'Parametros invalidos.' });

    try {
      const hoje = new Date();
      const inicio = parsed.data.from ? new Date(`${parsed.data.from}T00:00:00`) : startOfMonth(hoje);
      const fim = parsed.data.to ? new Date(`${parsed.data.to}T23:59:59.999`) : endOfMonth(hoje);

      const cancelados = await request.tenantDb.alunoPlano.findMany({
        where: {
          aluno: { idCliente },
          dtEncerramento: { gte: inicio, lte: fim },
        },
        select: {
          id: true,
          dtEncerramento: true,
          dsMotivoCancelamento: true,
          motivoCancelamento: { select: { id: true, dsMotivoCancelamento: true } },
        },
        orderBy: { dtEncerramento: 'desc' },
      });

      const porMotivo = new Map<string, number>();
      for (const cancelado of cancelados) {
        // Cancelamentos anteriores a esta feature nao tem motivo. Contar como
        // "nao informado" e mais honesto do que escondê-los da soma.
        const chave = cancelado.motivoCancelamento?.dsMotivoCancelamento ?? 'Não informado';
        porMotivo.set(chave, (porMotivo.get(chave) ?? 0) + 1);
      }

      return {
        periodo: { inicio, fim },
        total: cancelados.length,
        porMotivo: [...porMotivo.entries()]
          .map(([motivo, quantidade]) => ({ motivo, quantidade }))
          .sort((a, b) => b.quantidade - a.quantidade),
        // As observações livres, para ler o que a lookup não captura.
        observacoes: cancelados
          .filter((cancelado) => cancelado.dsMotivoCancelamento)
          .map((cancelado) => ({
            dtEncerramento: cancelado.dtEncerramento,
            motivo: cancelado.motivoCancelamento?.dsMotivoCancelamento ?? null,
            observacao: cancelado.dsMotivoCancelamento,
          }))
          .slice(0, 50),
      };
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao montar o relatorio de cancelamentos.'),
      });
    }
  });

  // Alunos com plano ativo que pararam de aparecer.
  //
  // O DADO SEMPRE EXISTIU (cada check-in e uma linha); o que faltava era
  // alguem perguntar. E a pergunta so vale a pena se distinguir "assiduo que
  // sumiu" de "nunca veio": por isso a lista carrega a frequencia dos 90 dias
  // anteriores e vem ordenada por ela. Quem treinava tres vezes por semana e
  // sumiu ha dez dias aparece antes de quem se matriculou e nunca apareceu —
  // sao dois problemas diferentes, e o primeiro ainda tem conserto.
  app.get<{
    Querystring: { idEmpresa?: string; days?: string };
  }>('/reports/inactive-students', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });

    const parsed = inactiveQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ message: 'Parametros invalidos.' });

    try {
      if (parsed.data.idEmpresa) {
        const empresa = await request.tenantDb.empresa.findFirst({
          where: { id: parsed.data.idEmpresa, idCliente },
          select: { id: true },
        });
        if (!empresa) return reply.code(404).send({ message: 'Empresa nao encontrada.' });
      }

      const cliente = await prisma.cliente.findUnique({
        where: { id: idCliente },
        select: { nrDiasSemCheckIn: true },
      });
      const dias = parsed.data.days ?? cliente?.nrDiasSemCheckIn ?? 10;

      const agora = new Date();
      const corte = new Date(agora.getTime() - dias * 24 * 60 * 60 * 1000);
      const noventaDias = new Date(agora.getTime() - 90 * 24 * 60 * 60 * 1000);

      // So quem tem plano VIGENTE. Quem cancelou nao evadiu — ja saiu, e
      // avisa-lo de que sumiu seria constrangedor.
      const planosAtivos = await request.tenantDb.alunoPlano.findMany({
        where: {
          boInativo: false,
          aluno: { idCliente, boInativo: false },
          OR: [{ dtEncerramento: null }, { dtEncerramento: { gte: agora } }],
        },
        select: {
          idAluno: true,
          dtAdmissao: true,
          aluno: { select: { id: true, nmAluno: true, anEmail: true, nrDDD: true, nrContato: true } },
          plano: { select: { id: true, dsPlano: true } },
        },
      });

      if (planosAtivos.length === 0) {
        return { diasSemCheckIn: dias, corte, total: 0, alunos: [] };
      }

      const idsAlunos = [...new Set(planosAtivos.map((item) => item.idAluno))];
      const escopoEmpresa = parsed.data.idEmpresa
        ? { idEmpresa: parsed.data.idEmpresa }
        : { empresa: { idCliente } };

      const [ultimos, frequencia] = await Promise.all([
        // Ultima visita de sempre — sem recorte de data, senao quem sumiu ha
        // seis meses apareceria como "nunca veio".
        request.tenantDb.alunoCheckIn.groupBy({
          by: ['idAluno'],
          // So presenca de verdade. Sessao aberta no app nao pode zerar o
          // contador de evasao: o aluno sumido continuaria "visto ontem" so
          // por abrir o aplicativo do sofa.
          where: {
            boInativo: false,
            boPresencial: true,
            idAluno: { in: idsAlunos },
            ...escopoEmpresa,
          },
          _max: { dtCadastro: true },
        }),
        request.tenantDb.alunoCheckIn.groupBy({
          by: ['idAluno'],
          where: {
            boInativo: false,
            boPresencial: true,
            idAluno: { in: idsAlunos },
            dtCadastro: { gte: noventaDias },
            ...escopoEmpresa,
          },
          _count: { _all: true },
        }),
      ]);

      const ultimaVisita = new Map(
        ultimos.map((linha) => [linha.idAluno, linha._max.dtCadastro ?? null]),
      );
      const visitas90 = new Map(frequencia.map((linha) => [linha.idAluno, linha._count._all]));

      const alunos = planosAtivos
        .map((matricula) => {
          const ultima = ultimaVisita.get(matricula.idAluno) ?? null;
          return {
            idAluno: matricula.idAluno,
            nmAluno: matricula.aluno?.nmAluno ?? 'Aluno',
            anEmail: matricula.aluno?.anEmail ?? '',
            nrDDD: matricula.aluno?.nrDDD ?? null,
            nrContato: matricula.aluno?.nrContato ?? null,
            plano: matricula.plano?.dsPlano ?? null,
            dtUltimoCheckIn: ultima,
            diasSemVir: ultima
              ? Math.floor((agora.getTime() - new Date(ultima).getTime()) / 86_400_000)
              : null,
            visitas90Dias: visitas90.get(matricula.idAluno) ?? 0,
            // Nunca apareceu desde que se matriculou. E outro problema — nao e
            // evasao, e uma matricula que nunca comecou — mas quem liga para o
            // aluno precisa saber a diferenca antes de discar.
            nuncaVeio: ultima === null,
          };
        })
        .filter((aluno) => aluno.dtUltimoCheckIn === null || new Date(aluno.dtUltimoCheckIn) < corte)
        // Quem mais treinava primeiro: e de quem a ausencia mais destoa.
        .sort((a, b) => b.visitas90Dias - a.visitas90Dias || (b.diasSemVir ?? 0) - (a.diasSemVir ?? 0));

      return {
        diasSemCheckIn: dias,
        corte,
        total: alunos.length,
        comHistorico: alunos.filter((aluno) => !aluno.nuncaVeio).length,
        nuncaVieram: alunos.filter((aluno) => aluno.nuncaVeio).length,
        alunos: alunos.slice(0, 200),
      };
    } catch (error) {
      request.log.error(error);
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao montar a lista de evasao.'),
      });
    }
  });
}
