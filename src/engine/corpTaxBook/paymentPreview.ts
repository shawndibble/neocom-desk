/**
 * What one more Tax Payment would do to a Miner, before it is recorded: which days it pays or
 * part-pays, oldest first, what is still owed after, and the credit held when it pays more than
 * is owed. It builds the Miner's Running account with and without the payment, so the preview
 * can never disagree with what the book shows afterwards. The lines are the payment's own: a
 * backdated payment that moves an older one onto a later day lists only where its own ISK went.
 */
import { MinerRunningAccount, type MinerRunningAccountInput } from './minerRunningAccount';
import type { TaxPayment } from './payments';
import type { BookView } from './bookView';

export interface PaymentOutcomeLine {
  date: string;
  /** What this payment puts on the day. */
  applied: number;
  /** Left on it after the payment (0 once paid, tolerance included). */
  remainingAfter: number;
  settled: boolean;
}

export interface PaymentOutcome {
  /** The days the money goes to, oldest first. */
  lines: PaymentOutcomeLine[];
  owedBefore: number;
  owedAfter: number;
  creditAfter: number;
  /** Credit this payment adds (the overpayment). */
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
    owedBefore: before.owes?.amount ?? 0,
    owedAfter: after.owes?.amount ?? 0,
    creditAfter: after.credit,
    creditAdded: Math.max(0, after.credit - before.credit),
  };
}

/** `previewPayment` for one Miner of a built book; undefined for a Miner the book doesn't hold. */
export function previewMinerPayment(
  view: BookView,
  minerId: string,
  payment: Omit<TaxPayment, 'minerId'>
): PaymentOutcome | undefined {
  const inner = view.internals.byMiner.get(minerId);
  if (!inner) return undefined;
  return previewPayment(inner.account.input, { ...payment, minerId });
}
