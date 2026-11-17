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
 * stored paid-through stays paid even when money is later taken back (D22), and takes no more
 * money. Days are settled a date at a time: what one date's lines owe together.
 */
import {
  allocatePayments,
  SETTLE_TOLERANCE_PCT,
  type Allocation,
  type AllocationInput,
} from './allocation';
import type { StatementLine } from './statements';

/** The default per-day tolerance: the Statement tolerance's percent, without its ISK floor. */
export const DAY_SETTLE_TOLERANCE_PCT = SETTLE_TOLERANCE_PCT;

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
  /** The Miner's closed days not on any Statement, in any order; several entries for a date add up. */
  days: readonly RunningDay[];
  /** Dates an open dispute holds (unlike `held`, which is by Statement). */
  heldDays?: ReadonlySet<string>;
  /** The newest day the book has recorded as paid (`meta/paid`): it and every day before it stay closed. */
  storedPaidThrough?: string;
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
  /**
   * The newest day with nothing owed on or before it (days an open dispute holds neither stop nor
   * advance it), never before the stored one; null while a Statement is unpaid or no day is paid yet.
   */
  paidThrough: string | null;
  /** What is owed now: the amount, how many dates it covers (an unpaid Statement's too), the oldest. */
  owes: { amount: number; days: number; oldest: string } | null;
}

type Running = { tax: number; credited: number; paidIn: number; forgiven: number; pinned: boolean };

export function allocateRunningAccount(input: RunningAccountInput): RunningAccount {
  const legacy = allocatePayments(input);
  // Money that is not a payment (negative Statements, dismissals) reaches days without the tolerance.
  const legacyNonPayment = Math.min(
    legacy.credit,
    allocatePayments({ ...input, payments: [] }).credit
  );
  const pct = input.dayTolerancePct ?? DAY_SETTLE_TOLERANCE_PCT;
  const held = input.heldDays ?? new Set<string>();
  const stored = input.storedPaidThrough;
  // One unit per date, whatever the caller passed.
  const days = runningDaysFromLines(input.days);
  const state = new Map<string, Running>(
    days.map((d) => [
      d.date,
      {
        tax: d.tax,
        credited: 0,
        paidIn: 0,
        forgiven: 0,
        pinned: stored !== undefined && d.date <= stored,
      },
    ])
  );
  const isHeld = (d: RunningDay) => held.has(d.date) && d.tax > 0;
  const isDone = (st: Running) => {
    const remaining = st.tax - st.credited;
    return remaining <= 0 || (st.paidIn > 0 && remaining <= daySettleTolerance(st.tax, pct));
  };
  const pay = (available: number, kind: 'payment' | 'correction' | 'writeOff'): number => {
    for (const d of days) {
      if (available <= 0) break;
      const st = state.get(d.date)!;
      // A day already recorded paid is closed: money goes on to the oldest day still owed.
      if (isHeld(d) || st.tax <= 0 || st.pinned || isDone(st)) continue;
      const take = Math.min(available, st.tax - st.credited);
      st.credited += take;
      if (kind === 'payment') st.paidIn += take;
      if (kind === 'writeOff') st.forgiven += take;
      available -= take;
    }
    return available;
  };

  // A day that came out negative (credit corrections) pays the oldest owed days, as a dismissal would.
  const corrections = days.reduce((sum, d) => sum + Math.max(0, -d.tax), 0);
  let credit = pay(corrections + legacyNonPayment, 'correction');
  credit += pay(legacy.credit - legacyNonPayment, 'payment');

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
  const owedDates = new Set<string>();
  let paidThrough: string | null = stored ?? null;
  let gap = false;
  for (const d of days) {
    const st = state.get(d.date)!;
    const dayHeld = isHeld(d);
    const settled = st.tax <= 0 || st.pinned || (!dayHeld && isDone(st));
    const shortfall = Math.max(0, st.tax - st.credited);
    const writtenOff = settled ? shortfall : 0;
    const remaining = shortfall - writtenOff;
    // A held day is not due, as `allocatePayments` leaves a held amount out of what is billed.
    if (!dayHeld) billed += Math.max(0, st.tax);
    forgivenTotal += st.forgiven;
    writtenOffTotal += writtenOff;
    if (!settled && !dayHeld) {
      owedAmount += remaining;
      owedDates.add(d.date);
      gap = true;
    }
    // A held day neither stops nor advances "paid through".
    if (!gap && settled && (!paidThrough || d.date > paidThrough)) paidThrough = d.date;
    byDay.set(d.date, {
      tax: st.tax,
      held: dayHeld,
      credited: st.credited,
      forgiven: st.forgiven,
      writtenOff,
      remaining,
      settled,
    });
  }

  let legacyOwed = 0;
  for (const s of input.statements) {
    const st = legacy.byStatement.get(s.id);
    if (!st || st.settled || st.remaining <= 0) continue;
    legacyOwed += st.remaining;
    const dates = s.lines.filter((l) => l.tax > 0).map((l) => l.date);
    for (const date of dates.length > 0 ? dates : [s.coversFrom]) owedDates.add(date);
  }
  if (legacyOwed > 0) paidThrough = null;

  const amount = legacyOwed + owedAmount;
  const oldest = [...owedDates].sort()[0];
  return {
    legacy,
    byDay,
    credit,
    balance: legacy.balance + billed - corrections - forgivenTotal - writtenOffTotal,
    paidThrough,
    owes: amount > 0 && oldest ? { amount, days: owedDates.size, oldest } : null,
  };
}
