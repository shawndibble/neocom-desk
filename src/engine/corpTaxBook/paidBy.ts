/**
 * Whose money paid a day, for the member's day detail. The member overlay (`personal.ts`) pays
 * days from one pooled number per Miner (the book's credit plus the donations still in flight);
 * this keeps that pool as a queue of its sources so each day can say which payments it took.
 * Nothing here decides who is paid: it only reports what the pooled settlement already did.
 */
import { countedPayments, paymentNet, type TaxPayment } from './payments';

/** What reached one day, by kind of money. A credit correction is not a payment. */
export interface PaidBy {
  /** Book Tax Payments, with what each put on the day. */
  payments: { paymentId: string; amount: number }[];
  /** Donations the member sent that the book has not credited yet. `refId` is the member's own journal entry. */
  inFlight: { amount: number; at: string; refId?: number }[];
  /** Credit that came from no payment (a credit correction). */
  corrections?: number;
  /** What an officer forgave of the day: no payment's, and nothing was paid for it. */
  writtenOff?: number;
}

export type MoneySource =
  | { kind: 'credit'; amount: number }
  | { kind: 'payment'; paymentId: string; amount: number }
  | { kind: 'inFlight'; amount: number; at: string; refId?: number };

/** Below this a leftover is rounding, not money. */
const DUST = 0.01;

/**
 * The book's credit for one Miner as its sources, in the order the pool is spent: what no
 * payment gave (as the Running account pays corrections first), then each payment's leftover
 * after what it already paid (`paymentCredits`), oldest payment first.
 */
export function creditSources(
  payments: readonly TaxPayment[],
  allocation: { paymentCredits: readonly { paymentId: string; amount: number }[]; credit: number },
  startDate?: string
): MoneySource[] {
  const toStatements = new Map<string, number>();
  for (const c of allocation.paymentCredits)
    toStatements.set(c.paymentId, (toStatements.get(c.paymentId) ?? 0) + c.amount);
  const out: MoneySource[] = [];
  let fromPayments = 0;
  for (const p of countedPayments(payments, startDate)) {
    const amount = paymentNet(p) - (toStatements.get(p.id) ?? 0);
    if (amount <= DUST) continue;
    out.push({ kind: 'payment', paymentId: p.id, amount });
    fromPayments += amount;
  }
  const other = allocation.credit - fromPayments;
  return other > DUST ? [{ kind: 'credit', amount: other }, ...out] : out;
}

/** Whether a draw reached the day at all. */
export function hasMoney(p: PaidBy): boolean {
  return p.payments.length > 0 || p.inFlight.length > 0 || (p.corrections ?? 0) > 0;
}

/** Donations the member sent that the book has not credited, as sources, oldest first. */
export function inFlightSources(
  donations: readonly { amount: number; at: string; refId?: number }[]
): MoneySource[] {
  return [...donations]
    .sort((a, b) => a.at.localeCompare(b.at) || (a.refId ?? 0) - (b.refId ?? 0))
    .map((d) => ({
      kind: 'inFlight',
      amount: d.amount,
      at: d.at,
      ...(d.refId !== undefined ? { refId: d.refId } : {}),
    }));
}

/** Two draws on the same day as one. */
export function mergePaidBy(a: PaidBy | undefined, b: PaidBy): PaidBy {
  if (!a) return b;
  const payments = [...a.payments];
  for (const p of b.payments) {
    const same = payments.find((x) => x.paymentId === p.paymentId);
    if (same) same.amount += p.amount;
    else payments.push({ ...p });
  }
  const corrections = (a.corrections ?? 0) + (b.corrections ?? 0);
  const writtenOff = (a.writtenOff ?? 0) + (b.writtenOff ?? 0);
  return {
    payments,
    inFlight: [...a.inFlight, ...b.inFlight],
    ...(corrections > 0 ? { corrections } : {}),
    ...(writtenOff > 0 ? { writtenOff } : {}),
  };
}

/** A first-in-first-out queue of money: `skip` spends the front, `draw` spends it and says whose it was. */
export function moneyQueue(sources: readonly MoneySource[]) {
  const queue = sources.map((s) => ({ ...s }));
  let head = 0;
  function take(amount: number, onSlice: (source: MoneySource, slice: number) => void) {
    let left = amount;
    while (left > 0 && head < queue.length) {
      const source = queue[head]!;
      const slice = Math.min(left, source.amount);
      if (slice > 0) onSlice(source, slice);
      source.amount -= slice;
      left -= slice;
      if (source.amount <= 0) head += 1;
    }
  }
  return {
    skip(amount: number) {
      take(amount, () => {});
    },
    draw(amount: number): PaidBy {
      const out: PaidBy = { payments: [], inFlight: [] };
      let corrections = 0;
      take(amount, (source, slice) => {
        if (source.kind === 'payment')
          out.payments.push({ paymentId: source.paymentId, amount: slice });
        else if (source.kind === 'inFlight')
          out.inFlight.push({
            amount: slice,
            at: source.at,
            ...(source.refId !== undefined ? { refId: source.refId } : {}),
          });
        else corrections += slice;
      });
      if (corrections > 0) out.corrections = corrections;
      return out;
    },
  };
}
