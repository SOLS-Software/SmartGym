// Shared business-rule gate: whether a student is allowed to use the gym right
// now. Used by any feature that needs to check plan/payment status before
// letting a student in — check-in creation, login, mobile app screens, etc.
// Keep this the single source of truth for "is this student in good standing"
// so every caller agrees on the same rules.

import type { PrismaLike } from './payments.js';
import { getStatusIdByName } from './payments.js';

export type StudentAccessStatus = {
  idAluno: number;
  idAlunoPlano: number | null;
  hasPlan: boolean;
  planActive: boolean;
  paymentOverdue: boolean;
  paymentCancelled: boolean;
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
): Promise<StudentAccessStatus> {
  const plan = await db.alunoPlano.findFirst({
    where: { idAluno, boInativo: false },
    orderBy: { dtCadastro: 'desc' },
  });

  if (!plan) {
    return {
      idAluno,
      idAlunoPlano: null,
      hasPlan: false,
      planActive: false,
      paymentOverdue: false,
      paymentCancelled: false,
      canAccess: false,
      reason: 'Aluno nao possui plano ativo.',
    };
  }

  const now = new Date();
  const planActive = !plan.dtEncerramento || plan.dtEncerramento > now;

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
  const canAccess = planActive && !paymentCancelled && !paymentOverdue;

  let reason: string | null = null;
  if (!planActive) reason = 'Plano do aluno esta encerrado.';
  else if (paymentCancelled) reason = 'Pagamento do plano foi cancelado.';
  else if (paymentOverdue) reason = 'Pagamento em atraso.';

  return {
    idAluno,
    idAlunoPlano: plan.id,
    hasPlan: true,
    planActive,
    paymentOverdue,
    paymentCancelled,
    canAccess,
    reason,
  };
}
