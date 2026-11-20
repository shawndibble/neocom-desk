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
  countedPayments,
  paymentNet,
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
  /** Of `tax`, what officer corrections charged: never forgiven by a day being recorded paid. */
  charge?: number;
}

/** The running days a Miner's unbilled lines make: one per date, oldest first. */
export function runningDaysFromLines(
  lines: readonly (Pick<StatementLine, 'date' | 'tax'> & {
    kind?: StatementLine['kind'];
    charge?: number;
  })[]
): RunningDay[] {
  const byDate = new Map<string, { tax: number; charge: number }>();
  for (const l of lines) {
    const held = byDate.get(l.date) ?? { tax: 0, charge: 0 };
    held.tax += l.tax;
    held.charge += l.charge ?? (l.kind === 'correction' && l.tax > 0 ? l.tax : 0);
    byDate.set(l.date, held);
  }
  return [...byDate]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, tax: v.tax, ...(v.charge > 0 ? { charge: v.charge } : {}) }));
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
  /**
   * Per date, the most of that day's shortfall an officer lets the book forgive, instead of the
   * tolerance (`exemptionsOf`): 0 forgives nothing.
   */
  toleranceExemptions?: ReadonlyMap<string, number>;
}

/** Money credited to one day. */
export interface DayAmount {
  date: string;
  amount: number;
}

/**
 * Where one Tax Payment's money went. `statements`, `days` and `credit` add up to the payment's
 * tax (its amount less the part coded "not tax"). Money a tolerance wrote off is no payment's.
 */
export interface PaymentApplication {
  paymentId: string;
  /** The legacy Statements it settled, before any day. */
  statements: { statementId: string; amount: number }[];
  /** The days it paid, oldest first; a payment never pays a held day. */
  days: DayAmount[];
  /** What no Statement or day absorbed of this payment; the account's credit is this plus any left over from corrections. */
  credit: number;
}

/** Who paid each day, by kind of money. Credit corrections and officer write-offs are not payments. */
export interface RunningApplications {
  /** Every counted payment that carried tax, in the order the book applies them (oldest first). */
  payments: PaymentApplication[];
  /** Credit that came from a negative day, a dismissal or a negative Statement. */
  corrections: DayAmount[];
  /** Officer write-offs with no Statement. */
  writeOffs: DayAmount[];
}

export interface RunningAccount {
  /** The Statements issued before the switch-over, as `allocatePayments` settles them. */
  legacy: Allocation;
  byDay: Map<string, DaySettlement>;
  /** The same money as `byDay.credited`, split by where it came from. */
  applications: RunningApplications;
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

type Running = {
  tax: number;
  charge: number;
  credited: number;
  paidIn: number;
  forgiven: number;
  pinned: boolean;
  /** An officer's limit on what this day may forgive; none uses the book's tolerance. */
  exempt?: number;
};

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
        charge: d.charge ?? 0,
        credited: 0,
        paidIn: 0,
        forgiven: 0,
        pinned: stored !== undefined && d.date <= stored,
        ...(input.toleranceExemptions?.has(d.date)
          ? { exempt: input.toleranceExemptions.get(d.date)! }
          : {}),
      },
    ])
  );
  const isHeld = (d: RunningDay) => held.has(d.date) && d.tax > 0;
  const isDone = (st: Running) => {
    const remaining = st.tax - st.credited;
    const limit = st.exempt ?? daySettleTolerance(st.tax, pct);
    return remaining <= 0 || (st.paidIn > 0 && remaining <= limit);
  };
  // What each payment has left for the days once the legacy Statements took theirs, in the order
  // `pay` draws on them. The pool is paid in one go (a day's tolerance can close mid-run, so
  // payments are not applied one by one); the queue only says whose money each slice was.
  const toStatements = new Map<string, { statementId: string; amount: number }[]>();
  for (const c of legacy.paymentCredits) {
    const list = toStatements.get(c.paymentId) ?? [];
    list.push({ statementId: c.statementId, amount: c.amount });
    toStatements.set(c.paymentId, list);
  }
  const queue = countedPayments(input.payments, input.startDate)
    .filter((p) => paymentNet(p) > 0)
    .map((p): PaymentApplication & { left: number } => {
      const statements = toStatements.get(p.id) ?? [];
      const left = paymentNet(p) - statements.reduce((sum, s) => sum + s.amount, 0);
      return { paymentId: p.id, statements, days: [], credit: 0, left };
    });
  let head = 0;
  const attribute = (date: string, amount: number) => {
    while (amount > 0 && head < queue.length) {
      const q = queue[head]!;
      const slice = Math.min(amount, q.left);
      if (slice > 0) q.days.push({ date, amount: slice });
      q.left -= slice;
      amount -= slice;
      if (q.left <= 0) head += 1;
    }
  };
  const corrected: DayAmount[] = [];
  const forgivenDays: DayAmount[] = [];
  const pay = (available: number, kind: 'payment' | 'correction' | 'writeOff'): number => {
    for (const d of days) {
      if (available <= 0) break;
      const st = state.get(d.date)!;
      // A held day is skipped. A day recorded paid still takes its payment (oldest first), or that
      // money would be left over as credit on top of the day's own tax.
      if (isHeld(d) || st.tax <= 0 || isDone(st)) continue;
      const take = Math.min(available, st.tax - st.credited);
      st.credited += take;
      if (kind === 'payment') {
        st.paidIn += take;
        attribute(d.date, take);
      } else if (kind === 'writeOff') {
        st.forgiven += take;
        forgivenDays.push({ date: d.date, amount: take });
      } else {
        corrected.push({ date: d.date, amount: take });
      }
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
  let chargePool = 0;
  for (const st of state.values())
    if (st.pinned) chargePool += Math.min(st.charge, Math.max(0, st.tax));
  for (const d of days) {
    const st = state.get(d.date)!;
    const dayHeld = isHeld(d);
    // A day recorded paid stays closed, unless an officer set a limit on what it may forgive.
    const pinned = st.pinned && st.exempt === undefined;
    const shortfall = Math.max(0, st.tax - st.credited);
    // A day recorded paid stays closed, but officers' charges on recorded-paid days are owed, not
    // forgiven: they stay on the oldest such day that ended short, wherever the money fell.
    // Not on a held day (not due yet) nor one paid to within tolerance (closed, as an unrecorded day).
    const chargeOwed = pinned && !dayHeld && !isDone(st) ? Math.min(chargePool, shortfall) : 0;
    chargePool -= chargeOwed;
    const settled = st.tax <= 0 || (pinned && chargeOwed <= 0) || (!dayHeld && isDone(st));
    let writtenOff = settled ? shortfall : pinned ? shortfall - chargeOwed : 0;
    // An exemption that forgives less than the whole shortfall still forgives what it names.
    if (!settled && !dayHeld && st.paidIn > 0 && st.exempt)
      writtenOff = Math.max(writtenOff, Math.min(st.exempt, shortfall - chargeOwed));
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
    applications: {
      // What is left in the queue is the credit: the payments after the last day they reached.
      payments: queue.map(({ left, ...p }) => ({ ...p, credit: Math.max(0, left) })),
      corrections: corrected,
      writeOffs: forgivenDays,
    },
    credit,
    balance: legacy.balance + billed - corrections - forgivenTotal - writtenOffTotal,
    paidThrough,
    owes: amount > 0 && oldest ? { amount, days: owedDates.size, oldest } : null,
  };
}

/**
 * The newest day that may be stored as paid for good (D22): every day up to it is settled, held
 * by no dispute, before `today`, and priced at a saved close-of-day price. A day with no price
 * has no tax and reads as paid, so storing past one would forgive it; a live price is a guess
 * that moves. Null while a Statement is unpaid or no day qualifies. Only an officer's client can
 * compute it: the server has no prices. The stored day never moves back (`paidThrough` holds it).
 */
export function closableThrough(input: {
  account: Pick<RunningAccount, 'byDay' | 'paidThrough'>;
  /** The Miner's running days with whether every line was priced at a saved close-of-day price. */
  days: readonly (RunningDay & { savedPrices: boolean })[];
  heldDays: ReadonlySet<string>;
  /** The UTC date of the read; ore for it is still coming in. */
  today: string;
}): string | null {
  if (input.account.paidThrough === null) return null;
  let through: string | null = null;
  for (const d of [...input.days].sort((a, b) => a.date.localeCompare(b.date))) {
    const settled = input.account.byDay.get(d.date)?.settled === true;
    if (d.date >= input.today || input.heldDays.has(d.date) || !d.savedPrices || !settled) break;
    through = d.date;
  }
  return through;
}
