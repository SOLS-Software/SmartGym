// Shared business-rule gate: whether a student is allowed to use the gym right
// now. Used by any feature that needs to check plan/payment status before
// letting a student in — check-in creation, login, mobile app screens, etc.
// Keep this the single source of truth for "is this student in good standing"
// so every caller agrees on the same rules.

import type { PrismaLike } from './payments.js';
import { getStatusIdByName } from './payments.js';
import { motivoDoTrancamento, trancamentoVigente } from './trancamento.js';
import {
  avaliarFrequencia,
  motivoForaDaUnidade,
  planoCobreUnidade,
  type UsoDaFrequencia,
} from './planCoverage.js';

export type StudentAccessStatus = {
  idAluno: number;
  idAlunoPlano: number | null;
  hasPlan: boolean;
  planActive: boolean;
  /**
   * Matricula pausada hoje. Distinta de `planActive`: o contrato NAO acabou —
   * quem esta trancado volta, e por isso nao entra no churn. Para o acesso o
   * efeito e o mesmo (nao passa), mas quem le a recusa precisa da diferenca:
   * "trancado ate 10/05" e outra conversa na recepcao que "plano encerrado".
   */
  planPaused: boolean;
  paymentOverdue: boolean;
  paymentCancelled: boolean;
  /**
   * O plano nao cobre a unidade perguntada. So aparece quando quem pergunta
   * informa a unidade (catraca e recepcao); login e telas do aluno perguntam
   * sem unidade e nunca caem aqui.
   */
  unidadeNaoCoberta: boolean;
  /**
   * Frequencia do plano no periodo. INFORMATIVO: nao entra no `canAccess` por
   * decisao de negocio — limite comercial nao tranca a porta com a pessoa
   * parada na frente. Serve para a recepcao ver e conversar.
   */
  frequencia: UsoDaFrequencia;
  /** True only when every check passes — the single flag most callers need. */
  canAccess: boolean;
  /** Human-readable (pt-BR) explanation when canAccess is false; null otherwise. */
  reason: string | null;
};

/**
 * Evaluates a student's current standing: does their most recent active plan
 * exist, is it still within its vigencia, and is its most recent charge paid
 * (not overdue, not cancelled).
 *
 * Looks at the student's most recently created active (non-inativo) plan —
 * mirrors the "current plan" resolution already used for check-in creation
 * (students/routes.ts) — rather than every plan the student ever had.
 */
export async function getStudentAccessStatus(
  db: PrismaLike,
  idAluno: number,
  /**
   * Unidade onde o aluno esta tentando entrar. Opcional de proposito: quem
   * pergunta "ele esta em dia?" (login, tela do aluno) nao fala de porta
   * nenhuma, e nao pode receber "nao" so por falta de contexto.
   */
  idEmpresa?: number | null,
): Promise<StudentAccessStatus> {
  const plan = await db.alunoPlano.findFirst({
    where: { idAluno, boInativo: false },
    orderBy: { dtCadastro: 'desc' },
    include: {
      plano: {
        include: {
          planoEmpresas: { include: { empresa: { select: { dsEmpresa: true } } } },
        },
      },
    },
  });

  if (!plan) {
    return {
      idAluno,
      idAlunoPlano: null,
      hasPlan: false,
      planActive: false,
      planPaused: false,
      paymentOverdue: false,
      paymentCancelled: false,
      unidadeNaoCoberta: false,
      frequencia: { limite: null, usadas: 0, excedeu: false, aviso: null },
      canAccess: false,
      reason: 'Aluno nao possui plano ativo.',
    };
  }

  const now = new Date();
  const planActive = !plan.dtEncerramento || plan.dtEncerramento > now;

  // Trancamento vigente. A consulta traz so os registros abertos ou recentes; a
  // decisao de qual (se algum) cobre hoje e da regra pura em ./trancamento.ts.
  const trancamentos = await db.alunoPlanoTrancamento.findMany({
    where: { idAlunoPlano: plan.id, boInativo: false },
    orderBy: { dtInicio: 'desc' },
  });
  const pausa = trancamentoVigente(trancamentos, now);

  const idStatusCancelado = await getStatusIdByName(db, 'Cancelado');
  const idStatusPendente = await getStatusIdByName(db, 'Pendente');

  const latestPayment = await db.pagamento.findFirst({
    where: { idAlunoPlano: plan.id, boInativo: false },
    orderBy: [{ dtVencimento: 'desc' }, { dtCadastro: 'desc' }],
  });

  // Only flags "Cancelado" when that status has been seeded (payment-statuses
  // domain) — if it isn't set up yet, this simply never fires rather than
  // erroring or guessing at a fallback id.
  const paymentCancelled =
    idStatusCancelado !== null && latestPayment?.idStatusPagamento === idStatusCancelado;

  const overduePayment =
    idStatusPendente !== null
      ? await db.pagamento.findFirst({
          where: {
            idAlunoPlano: plan.id,
            boInativo: false,
            idStatusPagamento: idStatusPendente,
            dtVencimento: { lt: now },
          },
        })
      : null;

  const paymentOverdue = Boolean(overduePayment);
  const planPaused = pausa !== null;

  // Unidade: lista vazia no plano quer dizer rede toda (ver planCoverage.ts).
  const unidadesDoPlano = plan.plano?.planoEmpresas ?? [];
  const unidadeNaoCoberta = !planoCobreUnidade(unidadesDoPlano, idEmpresa);

  // Limite de entradas do plano ("3x por semana"). Campo proprio: o
  // `Frequencia` do plano e o ciclo de COBRANCA (ver planCoverage.ts).
  // Conta entrada PRESENCIAL — sessao aberta pelo app nao e visita.
  const limiteDoPlano = plan.plano
    ? {
        qtAcessosPeriodo: plan.plano.qtAcessosPeriodo,
        cnPeriodoAcesso: plan.plano.cnPeriodoAcesso,
      }
    : null;
  let frequencia: UsoDaFrequencia = { limite: null, usadas: 0, excedeu: false, aviso: null };
  if (limiteDoPlano?.qtAcessosPeriodo) {
    // 31 dias cobrem a maior janela possivel (mes). Buscar um ano de
    // check-ins para contar os ultimos 7 dias seria varrer a tabela que
    // mais cresce no sistema, a cada giro de catraca.
    const desde = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000);
    const entradas = await db.alunoCheckIn.findMany({
      where: { idAluno, boInativo: false, boPresencial: true, dtCadastro: { gte: desde } },
      select: { dtCadastro: true },
    });
    frequencia = avaliarFrequencia(
      limiteDoPlano,
      entradas.map((entrada) => entrada.dtCadastro),
      now,
    );
  }

  const canAccess =
    planActive && !planPaused && !paymentCancelled && !paymentOverdue && !unidadeNaoCoberta;

  // Ordem das recusas: a mais especifica primeiro. Quem esta trancado quase
  // sempre TAMBEM tem parcela em aberto (a cobranca fica suspensa durante a
  // pausa), e receber "pagamento em atraso" nesse caso manda o aluno discutir
  // uma divida que a propria academia suspendeu.
  let reason: string | null = null;
  if (!planActive) reason = 'Plano do aluno esta encerrado.';
  else if (pausa) reason = motivoDoTrancamento(pausa);
  else if (paymentCancelled) reason = 'Pagamento do plano foi cancelado.';
  else if (paymentOverdue) reason = 'Pagamento em atraso.';
  // Por ultimo: estar em dia e ter vindo na unidade errada e o caso menos
  // grave dos cinco, e a recusa aqui ja diz onde o plano vale.
  else if (unidadeNaoCoberta) reason = motivoForaDaUnidade(unidadesDoPlano);

  return {
    idAluno,
    idAlunoPlano: plan.id,
    hasPlan: true,
    planActive,
    planPaused,
    paymentOverdue,
    paymentCancelled,
    unidadeNaoCoberta,
    frequencia,
    canAccess,
    reason,
  };
}
