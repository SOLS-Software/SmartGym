// Payment generation rules for student plans.
//
// A plan's Frequencia defines its cycle length. Short cycles (<= 1 month, e.g.
// "Mensal") are treated as recurring: one pending payment is created and, once
// paid, the next one is generated — the plan never expires. Longer cycles
// (Trimestral, Anual, ...) are fixed-term: all installments are created up front
// (qtParcelas of them), and renewal is manual once everything is settled.
//
// Every plan records dtVencimento = admission + one full cycle (its vigencia).
// dtEncerramento is distinct: it stays null until the plan is actually
// cancelled, at which point the cancellation date is stored there.

import type { Prisma, PrismaClient } from '@prisma/client';

// tb_UnidadesTempo ids (see seed / lookups)
const UNIDADE_MINUTO = 1;
const UNIDADE_HORA = 2;
const UNIDADE_DIA = 3;
const UNIDADE_SEGUNDO = 4;
const UNIDADE_MES = 5;
const UNIDADE_ANO = 6;

type FrequenciaLike = {
  qtPeriodo: number;
  idUnidadeTempo: number;
};

export type PrismaLike = PrismaClient | Prisma.TransactionClient;

/** Cycle length expressed in whole months (0 when shorter than a month). */
export function getCycleMonths(freq: FrequenciaLike | null | undefined): number {
  if (!freq) return 1;
  const qt = freq.qtPeriodo > 0 ? freq.qtPeriodo : 1;
  switch (freq.idUnidadeTempo) {
    case UNIDADE_MES:
      return qt;
    case UNIDADE_ANO:
      return qt * 12;
    case UNIDADE_DIA:
      return Math.floor(qt / 30);
    case UNIDADE_HORA:
    case UNIDADE_MINUTO:
    case UNIDADE_SEGUNDO:
      return 0;
    default:
      return qt;
  }
}

/**
 * A plan is recurring when its cycle is at most one month — the frequency is the
 * billing period itself (Mensal, Semanal) rather than a fixed multi-month term.
 */
export function isRecurringFrequency(freq: FrequenciaLike | null | undefined): boolean {
  return getCycleMonths(freq) <= 1;
}

/** Adds one full frequency cycle to a date (used to schedule the next renewal). */
export function addFrequency(date: Date, freq: FrequenciaLike | null | undefined): Date {
  const next = new Date(date);
  const qt = freq && freq.qtPeriodo > 0 ? freq.qtPeriodo : 1;
  switch (freq?.idUnidadeTempo) {
    case UNIDADE_ANO:
      next.setFullYear(next.getFullYear() + qt);
      break;
    case UNIDADE_DIA:
      next.setDate(next.getDate() + qt);
      break;
    case UNIDADE_HORA:
      next.setHours(next.getHours() + qt);
      break;
    case UNIDADE_MINUTO:
      next.setMinutes(next.getMinutes() + qt);
      break;
    case UNIDADE_SEGUNDO:
      next.setSeconds(next.getSeconds() + qt);
      break;
    case UNIDADE_MES:
    default:
      next.setMonth(next.getMonth() + qt);
      break;
  }
  return next;
}

/**
 * Due date for the installment `monthOffset` months after `base`, landing on
 * `nrDiaPagamento`. The day is clamped to the last day of the target month.
 */
export function computeDueDate(base: Date, nrDiaPagamento: number, monthOffset: number): Date {
  const clampedDay = Math.min(Math.max(nrDiaPagamento, 1), 31);
  let year = base.getFullYear();
  let month = base.getMonth() + monthOffset;

  // When the payment day has already passed in the base month, push to next month
  // so the first installment is never before the admission date.
  if (monthOffset === 0 && clampedDay < base.getDate()) {
    month += 1;
  }

  const lastDay = new Date(year, month + 1, 0).getDate();
  const day = Math.min(clampedDay, lastDay);
  return new Date(year, month, day);
}

const STATUS_PENDENTE_FALLBACK = 1;
const STATUS_PAGO_FALLBACK = 2;

/** Resolves a payment status id by name (case-insensitive), or null if not seeded. */
export async function getStatusIdByName(db: PrismaLike, name: string): Promise<number | null> {
  const status = await db.statusPagamento.findFirst({
    where: { dsStatusPagamento: { equals: name, mode: 'insensitive' } },
    select: { id: true },
  });
  return status?.id ?? null;
}

/** Resolves the id of the "Pendente" payment status, falling back to id 1. */
async function getPendingStatusId(db: PrismaLike): Promise<number> {
  return (await getStatusIdByName(db, 'Pendente')) ?? STATUS_PENDENTE_FALLBACK;
}

/** Resolves the id of the "Pago" payment status, falling back to id 2. */
async function getPaidStatusId(db: PrismaLike): Promise<number> {
  return (await getStatusIdByName(db, 'Pago')) ?? STATUS_PAGO_FALLBACK;
}

// Promotion attached to the plan enrollment (via PromocaoPlano -> Promocao).
export type PromoLike = {
  qtPeriodo: number;
  pcDesconto: number | string | { toString(): string } | null;
  vlDesconto: number | string | { toString(): string } | null;
} | null | undefined;

function toNumber(value: number | string | { toString(): string } | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === 'number' ? value : Number(value.toString());
  return Number.isFinite(n) ? n : 0;
}

/**
 * Whether the promotion applies to installment `index` (0-based). qtPeriodo is
 * the number of installments covered; 0 means the promotion covers all of them.
 */
export function promoCoversInstallment(promo: PromoLike, index: number): boolean {
  if (!promo) return false;
  if (promo.qtPeriodo <= 0) return true;
  return index < promo.qtPeriodo;
}

/** Installment value after applying the promotion's discount (never below 0). */
export function promoDiscountedValue(base: number, promo: PromoLike): number {
  if (!promo) return base;
  let value = base;
  const pc = toNumber(promo.pcDesconto);
  const vl = toNumber(promo.vlDesconto);
  if (pc > 0) value -= value * (pc / 100);
  if (vl > 0) value -= vl;
  if (value < 0) value = 0;
  return Math.round(value * 100) / 100;
}

type GenerateArgs = {
  db: PrismaLike;
  idAlunoPlano: number;
  idEmpresa: number;
  nrDiaPagamento: number;
  qtParcelas: number;
  vlParcela: number;
  admissao: Date;
  freq: FrequenciaLike | null | undefined;
  promo?: PromoLike;
};

/**
 * Creates the initial pending payments when a plan is assigned to a student and
 * sets dtEncerramento on fixed-term plans. Applies the enrollment promotion to
 * the covered installments — a discount lowers vlPrevisto, and an installment
 * whose value is fully discounted is created already settled ("Pago").
 * Returns how many payments were made.
 */
export async function generateInitialPayments(args: GenerateArgs): Promise<number> {
  const { db, idAlunoPlano, idEmpresa, nrDiaPagamento, vlParcela, admissao, freq, promo } = args;
  const recurring = isRecurringFrequency(freq);
  const installments = recurring ? 1 : Math.max(1, args.qtParcelas);
  const idStatusPendente = await getPendingStatusId(db);
  const idStatusPago = await getPaidStatusId(db);

  const data: Prisma.PagamentoCreateManyInput[] = [];
  for (let i = 0; i < installments; i += 1) {
    const dtVencimento = computeDueDate(admissao, nrDiaPagamento, i);
    const covered = promoCoversInstallment(promo, i);
    const value = covered ? promoDiscountedValue(vlParcela, promo) : vlParcela;
    const isFree = covered && value <= 0;
    data.push({
      idEmpresa,
      idAlunoPlano,
      idStatusPagamento: isFree ? idStatusPago : idStatusPendente,
      vlPrevisto: value,
      vlPago: isFree ? 0 : null,
      dtPagamento: isFree ? dtVencimento : null,
      dtVencimento,
      dtCompetencia: computeDueDate(admissao, 1, i),
      boInativo: false,
    });
  }

  await db.pagamento.createMany({ data });

  // The plan's current cycle ends one full frequency after admission. This is
  // the vigencia (dtVencimento), recorded for both recurring and fixed-term
  // plans; dtEncerramento stays null until the plan is actually cancelled.
  const dtVencimento = addFrequency(admissao, freq);
  await db.alunoPlano.update({
    where: { id: idAlunoPlano },
    data: { dtVencimento },
  });

  return installments;
}

/**
 * After a recurring plan's payment is settled, generates the next pending
 * payment (one cycle later). No-op for fixed-term plans or when a pending
 * payment already exists for the plan.
 */
export async function generateNextRecurringPayment(
  db: PrismaLike,
  idPagamento: number,
): Promise<void> {
  const payment = await db.pagamento.findUnique({
    where: { id: idPagamento },
    include: {
      alunoPlano: {
        include: {
          plano: {
            include: {
              frequencia: true,
              planoValores: { where: { boInativo: false }, orderBy: { dtCadastro: 'desc' } },
            },
          },
          promocaoPlano: { include: { promocao: true } },
        },
      },
    },
  });

  if (!payment?.alunoPlano) return;
  const { alunoPlano } = payment;
  const freq = alunoPlano.plano?.frequencia ?? null;

  // Only recurring plans auto-renew.
  if (!isRecurringFrequency(freq)) return;

  const idStatusPendente = await getPendingStatusId(db);
  const idStatusPago = await getPaidStatusId(db);

  // Don't stack pending payments — only generate the next one when none is open.
  const openPending = await db.pagamento.count({
    where: { idAlunoPlano: alunoPlano.id, idStatusPagamento: idStatusPendente, boInativo: false },
  });
  if (openPending > 0) return;

  // The new installment's index is the number of payments already generated for
  // this plan — used to decide whether the promotion still covers it.
  const priorCount = await db.pagamento.count({
    where: { idAlunoPlano: alunoPlano.id, boInativo: false },
  });
  const promo = alunoPlano.promocaoPlano?.promocao ?? null;
  const base = payment.dtVencimento ?? payment.dtPagamento ?? new Date();
  const nextDue = addFrequency(base, freq);
  // Use the full plan value as the base so a covered installment isn't
  // discounted on top of an already-discounted previous payment.
  const planoValores = alunoPlano.plano?.planoValores ?? [];
  const empresaValue =
    planoValores.find((value) => value.idEmpresa === payment.idEmpresa) ?? planoValores[0] ?? null;
  const baseValue = empresaValue ? toNumber(empresaValue.vlVenda) : toNumber(payment.vlPrevisto);
  const covered = promoCoversInstallment(promo, priorCount);
  const value = covered ? promoDiscountedValue(baseValue, promo) : baseValue;
  const isFree = covered && value <= 0;

  await db.pagamento.create({
    data: {
      idEmpresa: payment.idEmpresa,
      idAlunoPlano: alunoPlano.id,
      idStatusPagamento: isFree ? idStatusPago : idStatusPendente,
      vlPrevisto: value,
      vlPago: isFree ? 0 : null,
      dtPagamento: isFree ? nextDue : null,
      dtVencimento: nextDue,
      dtCompetencia: computeDueDate(nextDue, 1, 0),
      boInativo: false,
    },
  });
}
