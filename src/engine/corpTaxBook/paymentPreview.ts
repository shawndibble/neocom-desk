/**
 * What one more Tax Payment would do to a Miner, before it is recorded: which
 * Statements it clears or part-pays, what is still owed after, and the credit
 * held when it pays more than is owed. It runs the book's own allocation
 * (`allocatePayments`) with and without the payment, so the preview can never
 * disagree with what the book shows afterwards. The lines are the payment's own
 * credits: a backdated payment that moves an older one onto a later Statement
 * lists only where its own ISK went.
 */
import {
  allocatePayments,
  type Allocation,
  type AllocationInput,
  type TaxPayment,
} from './allocation';
import type { BookView } from './bookView';

export interface PaymentOutcomeLine {
  statementId: string;
  /** What this payment credits to the Statement. */
  applied: number;
  /** Left on it after the payment (0 once settled, tolerance included). */
  remainingAfter: number;
  settled: boolean;
}

export interface PaymentOutcome {
  /** In the order the money goes: a pinned Statement first, then oldest first. */
  lines: PaymentOutcomeLine[];
  owedBefore: number;
  owedAfter: number;
  creditAfter: number;
  /** Credit this payment adds (the overpayment). */
  creditAdded: number;
}

/** What a payment can credit: its amount less any part an officer marked not tax. */
export function netOf(p: { amount: number; notTaxAmount?: number }): number {
  return p.amount - Math.min(p.notTaxAmount ?? 0, p.amount);
}

function owedOf(allocation: Allocation): number {
  let owed = 0;
  for (const s of allocation.byStatement.values()) if (!s.settled) owed += s.remaining;
  return owed;
}

export function previewPayment(input: AllocationInput, payment: TaxPayment): PaymentOutcome {
  const before = allocatePayments(input);
  const after = allocatePayments({ ...input, payments: [...input.payments, payment] });
  const ordered = [...input.statements].sort(
    (a, b) => a.issuedAt.localeCompare(b.issuedAt) || a.id.localeCompare(b.id)
  );
  const pinned = ordered.findIndex((s) => s.id === payment.statementId);
  if (pinned > 0) ordered.unshift(...ordered.splice(pinned, 1));
  const lines: PaymentOutcomeLine[] = [];
  for (const s of ordered) {
    const now = after.byStatement.get(s.id);
    const applied = after.paymentCredits
      .filter((c) => c.paymentId === payment.id && c.statementId === s.id)
      .reduce((sum, c) => sum + c.amount, 0);
    if (!now || applied <= 0) continue;
    lines.push({
      statementId: s.id,
      applied,
      remainingAfter: now.settled ? 0 : now.remaining,
      settled: now.settled,
    });
  }
  return {
    lines,
    owedBefore: owedOf(before),
    owedAfter: owedOf(after),
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
  return previewPayment(inner.allocationInput, { ...payment, minerId });
}
