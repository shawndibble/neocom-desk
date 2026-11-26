import { MinerRunningAccount, type MinerRunningAccountInput } from './minerRunningAccount';
import type { TaxPayment } from './payments';
import type { BookView } from './bookView';

export interface PaymentOutcomeLine {
  date: string;
  applied: number;
  remainingAfter: number;
  settled: boolean;
}

export interface OpenDayLine {
  date: string;
  applied: number;
}

export interface EstimateDay {
  date: string;
  amount: number;
}

export interface PaymentOutcome {
  lines: PaymentOutcomeLine[];
  openLines: OpenDayLine[];
  owedBefore: number;
  owedAfter: number;
  creditAfter: number;
  creditAdded: number;
}

export function previewPayment(
  input: MinerRunningAccountInput,
  payment: TaxPayment
): PaymentOutcome {
  const before = MinerRunningAccount.build(input);
  const after = MinerRunningAccount.build({ ...input, payments: [...input.payments, payment] });
  const mine = after.applications.payments.find((p) => p.paymentId === payment.id);
  const lines = (mine?.days ?? []).map((d): PaymentOutcomeLine => {
    const day = after.day(d.date);
    return {
      date: d.date,
      applied: d.amount,
      remainingAfter: day?.settled ? 0 : (day?.remaining ?? 0),
      settled: day?.settled ?? false,
    };
  });
  return {
    lines,
    openLines: [],
    owedBefore: before.owes?.amount ?? 0,
    owedAfter: after.owes?.amount ?? 0,
    creditAfter: after.credit,
    creditAdded: Math.max(0, after.credit - before.credit),
  };
}

export function coverOpenDays(
  outcome: PaymentOutcome,
  estimates: readonly EstimateDay[]
): PaymentOutcome {
  let left = outcome.creditAdded;
  const openLines: OpenDayLine[] = [];
  for (const day of [...estimates].sort((a, b) => a.date.localeCompare(b.date))) {
    const applied = Math.min(left, Math.max(0, day.amount));
    if (applied <= 0) continue;
    openLines.push({ date: day.date, applied });
    left -= applied;
  }
  const covered = outcome.creditAdded - left;
  return {
    ...outcome,
    openLines,
    creditAdded: left,
    creditAfter: Math.max(0, outcome.creditAfter - covered),
  };
}

export function previewMinerPayment(
  view: BookView,
  minerId: string,
  payment: Omit<TaxPayment, 'minerId'>
): PaymentOutcome | undefined {
  const inner = view.internals.byMiner.get(minerId);
  if (!inner) return undefined;
  return previewPayment(inner.account.input, { ...payment, minerId });
}
