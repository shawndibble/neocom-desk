/**
 * A Miner's running account (#6294, decision 20261117-033049): every closed day after the
 * book's switch-over is billed as it closes, and the Miner's money pays the oldest unpaid day
 * first, by amount. Statements issued before the switch-over keep their own rules and are paid
 * first (`allocatePayments`); what they leave over flows on to the running days.
 *
 * A day a payment reaches is paid when the money falls short of its tax by no more than the
 * book's tolerance, a percent of the day with no ISK floor; the gap is written off. A day no
 * payment reached stays owed in full. Credit is only money ahead of every billed day.
 *
 * Recomputed from the whole history each time, like `allocatePayments`; a day at or before the
 * stored `paidThrough` stays paid even when money is later taken back (D22).
 */
import { allocatePayments, type Allocation, type AllocationInput } from './allocation';
import type { StatementLine } from './statements';

export const DAY_SETTLE_TOLERANCE_PCT = 0.5;

/** How short of one day's tax a payment may fall and still pay it: a percent, never an ISK floor. */
export function daySettleTolerance(tax: number, pct: number = DAY_SETTLE_TOLERANCE_PCT): number {
  return (Math.max(0, tax) * pct) / 100;
}

/** One closed day on a Miner's running account: the tax of every line that day. */
export interface RunningDay {
  date: string;
  tax: number;
}

/** The running days a Miner's unbilled lines make: one per date, oldest first. */
export function runningDaysFromLines(
  lines: readonly Pick<StatementLine, 'date' | 'tax'>[]
): RunningDay[] {
  const byDate = new Map<string, number>();
  for (const l of lines) byDate.set(l.date, (byDate.get(l.date) ?? 0) + l.tax);
  return [...byDate].sort(([a], [b]) => a.localeCompare(b)).map(([date, tax]) => ({ date, tax }));
}

export interface DaySettlement {
  tax: number;
  /** Held by an open dispute: not due, and money passes over it. */
  held: boolean;
  /** Payments, credit corrections and officer write-offs credited to it. */
  credited: number;
  /** What officer write-offs forgave of it (part of `credited`). */
  forgiven: number;
  /** The shortfall the tolerance, or a stored paid-through, wrote off. */
  writtenOff: number;
  remaining: number;
  settled: boolean;
}

export interface RunningAccountInput extends AllocationInput {
  /** The Miner's closed days not on any Statement, oldest first or not. */
  days: readonly RunningDay[];
  /** Days with an open dispute. */
  heldDays?: ReadonlySet<string>;
  /** The newest day the book has recorded as paid: it never reopens. */
  paidThrough?: string;
  /** The book's per-day tolerance, in percent. */
  dayTolerancePct?: number;
}

export interface RunningAccount {
  /** The Statements issued before the switch-over, as `allocatePayments` settles them. */
  legacy: Allocation;
  byDay: Map<string, DaySettlement>;
  /** Money ahead of every billed day. */
  credit: number;
  /** Everything billed less everything paid, forgiven or written off; negative is credit. */
  balance: number;
  /** The newest day with nothing owed on or before it (held days aside); null when none. */
  paidThrough: string | null;
  /** What is owed now, or null when nothing is. */
  owes: { amount: number; days: number; oldest: string } | null;
}

type Running = { tax: number; credited: number; paidIn: number; forgiven: number; pinned: boolean };

export function allocateRunningAccount(input: RunningAccountInput): RunningAccount {
  const legacy = allocatePayments(input);
  const pct = input.dayTolerancePct ?? DAY_SETTLE_TOLERANCE_PCT;
  const held = input.heldDays ?? new Set<string>();
  const days = [...input.days].sort((a, b) => a.date.localeCompare(b.date));
  const state = new Map<string, Running>(
    days.map((d) => [
      d.date,
      {
        tax: d.tax,
        credited: 0,
        paidIn: 0,
        forgiven: 0,
        pinned: input.paidThrough !== undefined && d.date <= input.paidThrough,
      },
    ])
  );
  const isDone = (st: Running) => {
    const remaining = st.tax - st.credited;
    return remaining <= 0 || (st.paidIn > 0 && remaining <= daySettleTolerance(st.tax, pct));
  };
  const pay = (available: number, kind: 'payment' | 'correction' | 'writeOff'): number => {
    for (const d of days) {
      if (available <= 0) break;
      const st = state.get(d.date)!;
      if (held.has(d.date) || st.tax <= 0 || isDone(st)) continue;
      const take = Math.min(available, st.tax - st.credited);
      st.credited += take;
      if (kind === 'payment') st.paidIn += take;
      if (kind === 'writeOff') st.forgiven += take;
      available -= take;
    }
    return available;
  };

  // A day that came out negative (credit corrections) pays the days after it, as a payment can't.
  const corrections = days.reduce((sum, d) => sum + Math.max(0, -d.tax), 0);
  let credit = pay(corrections, 'correction');
  credit += pay(legacy.credit, 'payment');

  // What an officer write-off with no Statement left over, after every Statement it could reduce.
  const usedByWriteOff = new Map<string, number>();
  for (const c of legacy.writeOffCredits)
    usedByWriteOff.set(c.writeOffId, (usedByWriteOff.get(c.writeOffId) ?? 0) + c.amount);
  const writeOffLeft = (input.officerWriteOffs ?? [])
    .filter((w) => !w.statementId)
    .reduce((sum, w) => sum + Math.max(0, w.amount - (usedByWriteOff.get(w.id) ?? 0)), 0);
  pay(writeOffLeft, 'writeOff'); // a leftover is dropped, never credit

  const byDay = new Map<string, DaySettlement>();
  let billed = 0;
  let forgivenTotal = 0;
  let writtenOffTotal = 0;
  let owedAmount = 0;
  let owedDays = 0;
  let oldestOwed: string | undefined;
  let paidThrough: string | null = null;
  let gap = false;
  for (const d of days) {
    const st = state.get(d.date)!;
    const isHeld = held.has(d.date) && st.tax > 0;
    const settled = st.tax <= 0 || st.pinned || (!isHeld && isDone(st));
    const shortfall = Math.max(0, st.tax - st.credited);
    const writtenOff = settled ? shortfall : 0;
    const remaining = shortfall - writtenOff;
    billed += Math.max(0, st.tax);
    forgivenTotal += st.forgiven;
    writtenOffTotal += writtenOff;
    if (!settled && !isHeld) {
      owedAmount += remaining;
      owedDays += 1;
      oldestOwed ??= d.date;
      gap = true;
    }
    if (!gap && (settled || isHeld)) paidThrough = d.date;
    byDay.set(d.date, {
      tax: st.tax,
      held: isHeld,
      credited: st.credited,
      forgiven: st.forgiven,
      writtenOff,
      remaining,
      settled,
    });
  }

  let legacyOwed = 0;
  let legacyOldest: string | undefined;
  for (const s of input.statements) {
    const st = legacy.byStatement.get(s.id);
    if (!st || st.settled || st.remaining <= 0) continue;
    legacyOwed += st.remaining;
    if (!legacyOldest || s.coversFrom < legacyOldest) legacyOldest = s.coversFrom;
  }
  if (legacyOwed > 0) paidThrough = null;

  const amount = legacyOwed + owedAmount;
  const oldest = [legacyOldest, oldestOwed].filter((x): x is string => !!x).sort()[0];
  return {
    legacy,
    byDay,
    credit,
    balance: legacy.balance + billed - corrections - forgivenTotal - writtenOffTotal,
    paidThrough,
    owes: amount > 0 && oldest ? { amount, days: owedDays, oldest } : null,
  };
}
