// Os paineis analiticos da aba Dashboards.
//
// Sao os passos 3, 4 e 5 do roteiro que saiu do levantamento de indicadores:
// financeiro completo, painel de retencao, funil comercial e ocupacao. Todos
// respondem perguntas que o sistema ja tinha dado para responder e ninguem
// tinha perguntado.
//
// QUATRO ROTAS, NAO UMA
//
// Cada uma responde uma pergunta inteira e independente ("o dinheiro esta
// entrando?", "a base fica?", "o funil converte?", "a casa enche?"). Separadas,
// a tela carrega as quatro em paralelo e um erro em qualquer uma nao apaga as
// outras — que e o mesmo tratamento que a tela de Relatorios ja da ao bloco
// financeiro. Uma rota unica com vinte agregacoes seria mais lenta e falharia
// inteira.
//
// Todas caem em `reports.read` pelo padrao /reports(/|$) de plugins/permissions.
import type { FastifyInstance } from 'fastify';
import { Prisma } from '@smartgym/db';
import { z } from 'zod';
import { prisma } from '../../shared/prisma.js';
import { clientErrorMessage } from '../../shared/errors.js';
import { getStatusIdByName } from '../../shared/payments.js';
import { churnMensal, montarCoorte, permanencia, type Matricula } from './coorte.js';
import { MESES_PT } from './janelas.js';

const SAFRAS = 6;
const SEMANAS_DE_PREVISAO = 8;
const SEMANAS_DE_MAPA = 8;
const DIAS_DE_MIX = 90;

const escopoSchema = z.object({
  idEmpresa: z.coerce.number().int().optional(),
});

const DIA = 86_400_000;

function inicioDoDia(data: Date) {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate());
}

function inicioDoMes(data: Date) {
  return new Date(data.getFullYear(), data.getMonth(), 1);
}

function toNumber(valor: unknown): number {
  const n = Number(valor ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Valida a filial e devolve o id, ou null quando o relatorio olha a rede. */
async function resolverEmpresa(
  idCliente: number,
  idEmpresa: number | undefined,
): Promise<number | null | 'nao-encontrada'> {
  if (!idEmpresa) return null;
  const empresa = await prisma.empresa.findFirst({
    where: { id: idEmpresa, idCliente },
    select: { id: true },
  });
  return empresa ? idEmpresa : 'nao-encontrada';
}

export async function registerDashboardRoutes(app: FastifyInstance) {
  // -------------------------------------------------------------------------
  // RETENCAO — a base fica?
  //
  // O levantamento apontou a coorte por safra como o relatorio de maior retorno
  // por hora de trabalho, e o motivo e que ela responde tres perguntas que
  // nenhum numero isolado responde: se a academia esta melhorando em segurar
  // aluno, em que mes do contrato as pessoas somem, e se a promocao de um mes
  // trouxe gente que fica ou gente que testa.
  //
  // Uma consulta so alimenta os tres blocos: coorte, churn e permanencia saem
  // todos da mesma lista de (inicio, fim). Puxar o intervalo e agregar em JS,
  // em vez de tres GROUP BY, porque a matematica de coorte e onde o erro se
  // esconde — e em JS ela fica testavel sem banco (ver coorte.test.ts).
  // -------------------------------------------------------------------------
  app.get('/reports/retention', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });

    try {
      const agora = new Date();
      // Uma safra a mais do que a tabela mostra, para o churn do mes mais antigo
      // ainda ter base de comparacao.
      const janela = new Date(agora.getFullYear(), agora.getMonth() - SAFRAS, 1);

      const linhas = await prisma.alunoPlano.findMany({
        where: { boInativo: false, aluno: { idCliente } },
        select: { dtAdmissao: true, dtCadastro: true, dtEncerramento: true },
      });

      // `dtAdmissao` e nulavel; `dtCadastro` (NOT NULL) diz quando a linha
      // passou a existir. Sem o fallback, matricula antiga sem data de admissao
      // sumiria da coorte e o denominador ficaria menor que a realidade.
      const matriculas: Matricula[] = linhas.map((linha) => ({
        inicio: linha.dtAdmissao ?? linha.dtCadastro,
        fim: linha.dtEncerramento,
      }));

      const encerradas = matriculas.filter((matricula) => matricula.fim !== null);

      // Valor JA REALIZADO por matricula encerrada — um fato, nao uma projecao.
      //
      // Nao chamamos isto de LTV de proposito: LTV projeta quanto um aluno vai
      // render, o que exige modelar permanencia futura e ticket futuro. Isto
      // aqui e o que as matriculas que ja terminaram de fato renderam. E um
      // numero menor e mais chato, e e verdade.
      const idPago = await getStatusIdByName(prisma, 'Pago');
      const realizado = await prisma.pagamento.aggregate({
        where: {
          boInativo: false,
          empresa: { idCliente },
          ...(idPago ? { idStatusPagamento: idPago } : {}),
          alunoPlano: { dtEncerramento: { not: null }, aluno: { idCliente } },
        },
        _sum: { vlPago: true },
      });

      const permanenciaCalculada = permanencia(matriculas);
      const totalRealizado = toNumber(realizado._sum.vlPago);

      return {
        geradoEm: agora,
        janela,
        coorte: {
          safras: montarCoorte(matriculas, SAFRAS, agora),
          // A tela precisa saber que a ultima coluna de cada linha e o mes
          // corrente, ainda em curso.
          mesCorrente: `${MESES_PT[agora.getMonth()]}/${`${agora.getFullYear()}`.slice(2)}`,
        },
        churn: churnMensal(matriculas, SAFRAS, agora),
        permanencia: permanenciaCalculada,
        valorPorMatriculaEncerrada:
          encerradas.length > 0
            ? { total: totalRealizado, media: totalRealizado / encerradas.length, base: encerradas.length }
            : null,
      };
    } catch (error) {
      request.log.error(error);
      return reply
        .code(400)
        .send({ message: clientErrorMessage(error, 'Erro ao montar o painel de retencao.') });
    }
  });

  // -------------------------------------------------------------------------
  // RECEBIVEIS — o dinheiro esta entrando?
  //
  // O relatorio financeiro atual da um total de inadimplencia. Um total nao
  // diz o que fazer: R$ 5.000 vencidos ontem e um lembrete no WhatsApp,
  // R$ 5.000 vencidos ha quatro meses e prejuizo que ainda nao foi reconhecido.
  // O aging separa os dois.
  // -------------------------------------------------------------------------
  app.get<{ Querystring: { idEmpresa?: string } }>(
    '/reports/receivables',
    async (request, reply) => {
      const idCliente = request.user.idCliente;
      if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });

      const parsed = escopoSchema.safeParse(request.query);
      if (!parsed.success) return reply.code(400).send({ message: 'Parametros invalidos.' });

      try {
        const empresa = await resolverEmpresa(idCliente, parsed.data.idEmpresa);
        if (empresa === 'nao-encontrada') {
          return reply.code(404).send({ message: 'Empresa nao encontrada.' });
        }

        const agora = new Date();
        const hoje = inicioDoDia(agora);
        const escopo = empresa ? { idEmpresa: empresa } : { empresa: { idCliente } };
        const base = { boInativo: false, ...escopo };

        const [idPendente, idPago] = await Promise.all([
          getStatusIdByName(prisma, 'Pendente'),
          getStatusIdByName(prisma, 'Pago'),
        ]);

        const [vencidos, aVencer, liquidados, formasDePagamento] = await Promise.all([
          prisma.pagamento.findMany({
            where: {
              ...base,
              ...(idPendente ? { idStatusPagamento: idPendente } : {}),
              dtVencimento: { lt: hoje },
            },
            select: { vlPrevisto: true, dtVencimento: true, idAlunoPlano: true },
          }),
          prisma.pagamento.findMany({
            where: {
              ...base,
              ...(idPendente ? { idStatusPagamento: idPendente } : {}),
              dtVencimento: { gte: hoje, lte: new Date(hoje.getTime() + SEMANAS_DE_PREVISAO * 7 * DIA) },
            },
            select: { vlPrevisto: true, dtVencimento: true },
          }),
          // Pontualidade: das parcelas liquidadas nos ultimos 90 dias, quantas
          // sairam no prazo. Diz se a inadimplencia e cronica ou pontual.
          prisma.pagamento.findMany({
            where: {
              ...base,
              ...(idPago ? { idStatusPagamento: idPago } : {}),
              dtPagamento: { gte: new Date(hoje.getTime() - DIAS_DE_MIX * DIA) },
            },
            select: { vlPago: true, vlPrevisto: true, dtPagamento: true, dtVencimento: true },
          }),
          prisma.pagamento.groupBy({
            by: ['idFormaPagamento'],
            where: {
              ...base,
              ...(idPago ? { idStatusPagamento: idPago } : {}),
              dtPagamento: { gte: new Date(hoje.getTime() - DIAS_DE_MIX * DIA) },
            },
            _sum: { vlPago: true },
            _count: { _all: true },
          }),
        ]);

        // Aging. As faixas sao as da cobranca: ate 30 dias ainda e atraso
        // comum, 90+ raramente volta sem negociacao.
        const faixas = [
          { label: 'ate 30 dias', min: 0, max: 30 },
          { label: '31 a 60 dias', min: 31, max: 60 },
          { label: '61 a 90 dias', min: 61, max: 90 },
          { label: 'mais de 90 dias', min: 91, max: Number.POSITIVE_INFINITY },
        ].map((faixa) => {
          const linhas = vencidos.filter((linha) => {
            if (!linha.dtVencimento) return false;
            const dias = Math.floor((hoje.getTime() - linha.dtVencimento.getTime()) / DIA);
            return dias >= faixa.min && dias <= faixa.max;
          });
          return {
            label: faixa.label,
            total: linhas.reduce((soma, linha) => soma + toNumber(linha.vlPrevisto), 0),
            quantidade: linhas.length,
            // Parcelas x pessoas: 40 parcelas vencidas podem ser 3 alunos, e e
            // o numero de pessoas que define quantas ligacoes fazer.
            alunos: new Set(linhas.map((linha) => linha.idAlunoPlano).filter(Boolean)).size,
          };
        });

        // Previsao de caixa por semana. Semanas corridas a partir de hoje, nao
        // de calendario: a pergunta e "quanto entra nos proximos 7, 14, 21
        // dias", nao "quanto entra na semana do dia 3".
        const previsao = Array.from({ length: SEMANAS_DE_PREVISAO }, (_, indice) => {
          const inicio = new Date(hoje.getTime() + indice * 7 * DIA);
          const fim = new Date(inicio.getTime() + 7 * DIA);
          const linhas = aVencer.filter(
            (linha) => linha.dtVencimento && linha.dtVencimento >= inicio && linha.dtVencimento < fim,
          );
          return {
            label: `${`${inicio.getDate()}`.padStart(2, '0')}/${`${inicio.getMonth() + 1}`.padStart(2, '0')}`,
            value: linhas.reduce((soma, linha) => soma + toNumber(linha.vlPrevisto), 0),
            quantidade: linhas.length,
          };
        });

        const comAtraso = liquidados.filter(
          (linha) => linha.dtVencimento && linha.dtPagamento && linha.dtPagamento > linha.dtVencimento,
        );
        const atrasoMedio =
          comAtraso.length > 0
            ? comAtraso.reduce(
                (soma, linha) =>
                  soma + (linha.dtPagamento!.getTime() - linha.dtVencimento!.getTime()) / DIA,
                0,
              ) / comAtraso.length
            : null;

        const idsDeForma = formasDePagamento
          .map((linha) => linha.idFormaPagamento)
          .filter((id): id is number => id !== null);
        const formas = idsDeForma.length
          ? await prisma.formaPagamento.findMany({
              where: { id: { in: idsDeForma } },
              select: { id: true, dsFormaPagamento: true },
            })
          : [];
        const nomeDaForma = new Map(formas.map((forma) => [forma.id, forma.dsFormaPagamento]));

        return {
          geradoEm: agora,
          escopo: { idEmpresa: empresa },
          aging: {
            faixas,
            total: faixas.reduce((soma, faixa) => soma + faixa.total, 0),
          },
          previsao: {
            semanas: previsao,
            total: previsao.reduce((soma, semana) => soma + semana.value, 0),
          },
          pontualidade: {
            liquidadas: liquidados.length,
            emAtraso: comAtraso.length,
            noPrazo: liquidados.length - comAtraso.length,
            atrasoMedioDias: atrasoMedio,
            diasAnalisados: DIAS_DE_MIX,
          },
          formasDePagamento: formasDePagamento
            .map((linha) => ({
              label:
                linha.idFormaPagamento === null
                  ? 'Nao informada'
                  : nomeDaForma.get(linha.idFormaPagamento) ?? 'Removida',
              total: toNumber(linha._sum.vlPago),
              quantidade: linha._count._all,
            }))
            .sort((a, b) => b.total - a.total),
        };
      } catch (error) {
        request.log.error(error);
        return reply
          .code(400)
          .send({ message: clientErrorMessage(error, 'Erro ao montar o painel de recebiveis.') });
      }
    },
  );

  // -------------------------------------------------------------------------
  // FUNIL — o interesse vira matricula?
  //
  // tb_Leads ja nasceu com status, origem, plano de interesse, responsavel e o
  // vinculo com o aluno convertido. O funil inteiro estava gravado e nao havia
  // tela que o fechasse.
  // -------------------------------------------------------------------------
  app.get<{ Querystring: { idEmpresa?: string } }>('/reports/funnel', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });

    const parsed = escopoSchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ message: 'Parametros invalidos.' });

    try {
      const empresa = await resolverEmpresa(idCliente, parsed.data.idEmpresa);
      if (empresa === 'nao-encontrada') {
        return reply.code(404).send({ message: 'Empresa nao encontrada.' });
      }

      const agora = new Date();
      const janela = new Date(agora.getFullYear(), agora.getMonth() - SAFRAS + 1, 1);

      const leads = await prisma.lead.findMany({
        where: {
          boInativo: false,
          idCliente,
          ...(empresa ? { idEmpresa: empresa } : {}),
          dtCadastro: { gte: janela },
        },
        select: {
          cnStatus: true,
          caOrigem: true,
          idAluno: true,
          idFuncionario: true,
          idPlano: true,
          dtContato: true,
          dtCadastro: true,
          funcionario: { select: { nmFuncionario: true } },
          plano: { select: { dsPlano: true } },
        },
      });

      // Conversao pelo VINCULO, nao pelo status. `idAluno` preenchido significa
      // que existe alguem do outro lado; 'convertido' sozinho e uma palavra que
      // alguem digitou. Onde os dois discordam, quem manda e o vinculo.
      const convertidos = leads.filter((lead) => lead.idAluno !== null);

      const agrupar = <T>(itens: T[], chave: (item: T) => string) => {
        const mapa = new Map<string, number>();
        for (const item of itens) {
          const k = chave(item);
          mapa.set(k, (mapa.get(k) ?? 0) + 1);
        }
        return [...mapa.entries()]
          .map(([label, quantidade]) => ({ label, quantidade }))
          .sort((a, b) => b.quantidade - a.quantidade);
      };

      // Tempo ate o primeiro contato: so faz sentido onde houve contato.
      const contatados = leads.filter((lead) => lead.dtContato !== null);
      const tempoAteContato =
        contatados.length > 0
          ? contatados.reduce(
              (soma, lead) => soma + (lead.dtContato!.getTime() - lead.dtCadastro.getTime()) / DIA,
              0,
            ) / contatados.length
          : null;

      const porOrigem = [...new Set(leads.map((lead) => lead.caOrigem))].map((origem) => {
        const daOrigem = leads.filter((lead) => lead.caOrigem === origem);
        const fechados = daOrigem.filter((lead) => lead.idAluno !== null).length;
        return {
          label: origem,
          leads: daOrigem.length,
          convertidos: fechados,
          taxa: daOrigem.length > 0 ? fechados / daOrigem.length : null,
        };
      }).sort((a, b) => b.leads - a.leads);

      const vendedores = new Map<string, { leads: number; convertidos: number }>();
      for (const lead of leads) {
        if (!lead.idFuncionario) continue;
        const nome = lead.funcionario?.nmFuncionario ?? `Profissional ${lead.idFuncionario}`;
        const atual = vendedores.get(nome) ?? { leads: 0, convertidos: 0 };
        atual.leads += 1;
        if (lead.idAluno !== null) atual.convertidos += 1;
        vendedores.set(nome, atual);
      }

      return {
        geradoEm: agora,
        escopo: { idEmpresa: empresa },
        periodo: { inicio: janela, fim: agora },
        total: leads.length,
        convertidos: convertidos.length,
        taxaConversao: leads.length > 0 ? convertidos.length / leads.length : null,
        semResponsavel: leads.filter((lead) => lead.idFuncionario === null).length,
        porStatus: agrupar(leads, (lead) => lead.cnStatus),
        porOrigem,
        porVendedor: [...vendedores.entries()]
          .map(([label, dados]) => ({
            label,
            ...dados,
            taxa: dados.leads > 0 ? dados.convertidos / dados.leads : null,
          }))
          .sort((a, b) => b.convertidos - a.convertidos || b.leads - a.leads),
        // O que a rua pede — util ao lado da distribuicao do que de fato se
        // vende (que a aba Relatorios ja mostra).
        planosDesejados: agrupar(
          leads.filter((lead) => lead.idPlano !== null),
          (lead) => lead.plano?.dsPlano ?? 'Plano removido',
        ),
        tempoAteContatoDias: tempoAteContato,
        semContato: leads.length - contatados.length,
      };
    } catch (error) {
      request.log.error(error);
      return reply
        .code(400)
        .send({ message: clientErrorMessage(error, 'Erro ao montar o funil.') });
    }
  });

  // -------------------------------------------------------------------------
  // OCUPACAO — quando a casa enche, e as aulas enchem?
  //
  // O mapa de calor foi o outro destaque do levantamento: a hora do check-in
  // sempre esteve gravada e nunca foi perguntada. E o dado que decide escala de
  // recepcao e de professor, e horario de aula nova.
  // -------------------------------------------------------------------------
  app.get<{ Querystring: { idEmpresa?: string } }>(
    '/reports/occupancy',
    async (request, reply) => {
      const idCliente = request.user.idCliente;
      if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });

      const parsed = escopoSchema.safeParse(request.query);
      if (!parsed.success) return reply.code(400).send({ message: 'Parametros invalidos.' });

      try {
        const empresa = await resolverEmpresa(idCliente, parsed.data.idEmpresa);
        if (empresa === 'nao-encontrada') {
          return reply.code(404).send({ message: 'Empresa nao encontrada.' });
        }

        const agora = new Date();
        const desde = new Date(inicioDoDia(agora).getTime() - SEMANAS_DE_MAPA * 7 * DIA);
        const fuso = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const fusoSeguro = fuso && /^[A-Za-z][A-Za-z0-9_+\-/]{0,63}$/.test(fuso) ? fuso : 'UTC';

        const escopoSql = empresa ? Prisma.sql`AND c."idEmpresa" = ${empresa}` : Prisma.empty;

        // Dia da semana e hora extraidos NO FUSO DO SERVIDOR — mesma razao do
        // date_trunc em overview.ts: em UTC, o treino das 22h vira madrugada do
        // dia seguinte e o pico da noite aparece de manha.
        //
        // dow do Postgres: 0 = domingo. Mantido como vem; a tela rotula.
        const mapa = await prisma.$queryRaw<Array<{ dia: number; hora: number; total: number }>>(
          Prisma.sql`
            SELECT
              EXTRACT(DOW FROM c."dtCadastro" AT TIME ZONE 'UTC' AT TIME ZONE ${fusoSeguro})::int AS dia,
              EXTRACT(HOUR FROM c."dtCadastro" AT TIME ZONE 'UTC' AT TIME ZONE ${fusoSeguro})::int AS hora,
              COUNT(*)::int AS total
            FROM "tb_AlunoCheckIns" c
            JOIN "tb_Empresas" e ON e.id = c."idEmpresa"
            WHERE c."boInativo" = false
              AND e."idCliente" = ${idCliente}
              ${escopoSql}
              AND c."dtCadastro" >= ${desde}
            GROUP BY 1, 2
          `,
        );

        // Turmas do periodo, com capacidade, inscritos e presenca.
        const turmas = await prisma.atividadeAgenda.findMany({
          where: {
            boInativo: false,
            empresa: { idCliente },
            ...(empresa ? { idEmpresa: empresa } : {}),
            dtInicial: { gte: desde, lte: agora },
          },
          select: {
            id: true,
            qtAlunos: true,
            dtInicial: true,
            atividade: { select: { dsAtividade: true } },
            _count: { select: { alunoAtividadeAgendas: true, alunoCheckIns: true } },
          },
        });

        // Agregado por atividade: a decisao de grade e sobre a modalidade, nao
        // sobre uma turma isolada de terca passada.
        const porAtividade = new Map<
          string,
          { turmas: number; vagas: number; inscritos: number; presencas: number }
        >();
        for (const turma of turmas) {
          const nome = turma.atividade?.dsAtividade ?? 'Sem atividade';
          const atual =
            porAtividade.get(nome) ?? { turmas: 0, vagas: 0, inscritos: 0, presencas: 0 };
          atual.turmas += 1;
          atual.vagas += turma.qtAlunos ?? 0;
          atual.inscritos += turma._count.alunoAtividadeAgendas;
          atual.presencas += turma._count.alunoCheckIns;
          porAtividade.set(nome, atual);
        }

        const atividades = [...porAtividade.entries()]
          .map(([label, dados]) => ({
            label,
            ...dados,
            // Nulas quando nao ha denominador — turma sem capacidade cadastrada
            // nao tem taxa de ocupacao, e fingir 0% acusaria a aula de vazia.
            ocupacao: dados.vagas > 0 ? dados.inscritos / dados.vagas : null,
            presenca: dados.inscritos > 0 ? dados.presencas / dados.inscritos : null,
          }))
          .sort((a, b) => b.inscritos - a.inscritos);

        const totalNoMapa = mapa.reduce((soma, ponto) => soma + ponto.total, 0);
        const pico = mapa.reduce(
          (maior, ponto) => (ponto.total > (maior?.total ?? 0) ? ponto : maior),
          null as { dia: number; hora: number; total: number } | null,
        );

        return {
          geradoEm: agora,
          escopo: { idEmpresa: empresa },
          periodo: { inicio: desde, fim: agora, semanas: SEMANAS_DE_MAPA },
          mapa,
          totalNoMapa,
          pico,
          atividades,
          turmasNoPeriodo: turmas.length,
          // Quantas turmas nao tem capacidade cadastrada — explica por que
          // algumas linhas aparecem sem taxa de ocupacao.
          turmasSemCapacidade: turmas.filter((turma) => !turma.qtAlunos).length,
        };
      } catch (error) {
        request.log.error(error);
        return reply
          .code(400)
          .send({ message: clientErrorMessage(error, 'Erro ao montar o painel de ocupacao.') });
      }
    },
  );
}
