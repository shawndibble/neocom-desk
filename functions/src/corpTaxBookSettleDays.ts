/**
 * The one oldest-first rule (decisions 20261117-033049 and 20261120-235011): how a Miner's money
 * settles their closed days. Credit corrections pay the oldest owed days, then payments, then
 * officer write-offs; a day a payment reaches is paid when it falls short by no more than the
 * tolerance (a percent of the mined part, never an officer's charge). The client's
 * `MinerRunningAccount` and the server's account walks both settle through `settleDays`.
 *
 * Import-free but for its siblings: `src` imports it across the boundary (`tsconfig.src.json`).
 */
import { DAY_TOLERANCE_PCT_DEFAULT } from './corpTaxBookKinds.js';

/** What is left of a day below this is float residue: the day is done (whole ISK on every screen). */
export const RESIDUE_ISK = 0.5;

/** The default per-day tolerance, in percent of the day's tax. */
export const DAY_SETTLE_TOLERANCE_PCT = DAY_TOLERANCE_PCT_DEFAULT;

/** How short of one day's tax a payment may fall and still pay it: a percent, never an ISK floor. */
function daySettleTolerance(tax: number, pct: number = DAY_SETTLE_TOLERANCE_PCT): number {
  return (Math.max(0, tax) * pct) / 100;
}

/** One closed day on a Miner's account: the tax of every line that day. */
export interface RunningDay {
  date: string;
  tax: number;
  /** Of `tax`, what officer corrections charged: never forgiven by a day being recorded paid. */
  charge?: number;
  /**
   * A checkpoint's owed day: what money paid of it before the checkpoint (it is paid again by
   * none), so the day keeps its whole tax, and its tolerance, after the checkpoint (M1).
   */
  paidBefore?: number;
  /**
   * Whether the line was priced at a saved close-of-day price (`savedPrice`); absent counts as
   * saved. Only a date whose every line is may be stored as paid for good (`closableThrough`).
   */
  savedPrice?: boolean;
}

/** What became of one day. */
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

/** Money credited to one day. */
export interface DayAmount {
  date: string;
  amount: number;
}

/** Where one Tax Payment's money went: `days` and `credit` add up to the payment's tax. */
export interface RunningAccountPayment {
  paymentId: string;
  /** The days it paid, oldest first; a payment never pays a held day. */
  days: DayAmount[];
  /** What no day absorbed of this payment. */
  credit: number;
}

/** What became of each kind of money. Money a tolerance wrote off is no payment's. */
export interface RunningAccountApplications {
  /** Every counted payment that carried tax, oldest first. */
  payments: RunningAccountPayment[];
  /** Credit that came from a negative day. */
  corrections: DayAmount[];
  /** What officer write-offs forgave, by day. */
  writeOffs: DayAmount[];
}

/** What is owed now: the amount, how many dates it covers, the oldest. */
export interface RunningAccountOwes {
  amount: number;
  days: number;
  oldest: string;
}

/** The running days a Miner's unbilled lines make: one per date, oldest first. */
export function runningDaysFromLines(
  lines: readonly {
    date: string;
    tax: number;
    /** A `correction` line's positive tax is an officer's charge. */
    kind?: string;
    charge?: number;
    paidBefore?: number;
  }[]
): RunningDay[] {
  const byDate = new Map<string, { tax: number; charge: number; paidBefore: number }>();
  for (const l of lines) {
    const held = byDate.get(l.date) ?? { tax: 0, charge: 0, paidBefore: 0 };
    held.tax += l.tax;
    held.charge += l.charge ?? (l.kind === 'correction' && l.tax > 0 ? l.tax : 0);
    held.paidBefore += l.paidBefore ?? 0;
    byDate.set(l.date, held);
  }
  return [...byDate]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date,
      tax: v.tax,
      ...(v.charge > 0 ? { charge: v.charge } : {}),
      ...(v.paidBefore > 0 ? { paidBefore: v.paidBefore } : {}),
    }));
}

/** The money `settleDays` spreads over the days, oldest day first. */
export interface DayPools {
  /** The payments' money for the days, paid in one go (a day's tolerance can close mid-run). */
  paymentPool: number;
  /** Each payment's share of `paymentPool`, oldest first: only says whose money each slice was. */
  payments: readonly { paymentId: string; left: number }[];
  /** What officer write-offs may forgive, after every payment; a leftover is dropped. */
  writeOffPool: number;
}

/** The part of an account's input that says how days settle; the money comes in `DayPools`. */
export interface DaysInput {
  /** The closed days, in any order; several entries for a date add up. */
  days: readonly RunningDay[];
  /** Dates an open dispute holds. */
  heldDays?: ReadonlySet<string>;
  /** The newest day recorded as paid for good: it and every day before it stay closed. */
  storedPaidThrough?: string;
  /** The per-day tolerance, in percent. */
  dayTolerancePct?: number;
  /** Per date, the most of that day's shortfall an officer lets the book forgive (0: nothing). */
  toleranceExemptions?: ReadonlyMap<string, number>;
}

/** What `settleDays` makes of the days, before the caller takes the payments off the balance. */
export interface SettledDays {
  byDay: Map<string, DaySettlement>;
  applications: RunningAccountApplications;
  credit: number;
  /** Billed less what corrections, write-offs and the tolerance took: no payment is off it yet. */
  balanceBeforePayments: number;
  paidThrough: string | null;
  owes: RunningAccountOwes | null;
}

type Running = {
  tax: number;
  charge: number;
  credited: number;
  paidIn: number;
  forgiven: number;
  pinned: boolean;
  /** Of `credited`, what money paid before the checkpoint: billed and paid there, not here. */
  before: number;
  /** An officer's limit on what this day may forgive; none uses the book's tolerance. */
  exempt?: number;
};

/** Settles the days from the given pools: corrections first, then payments, then officer write-offs. */
export function settleDays(input: DaysInput, pools: DayPools): SettledDays {
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
        // What money paid of a checkpoint's owed day before it: paid, and by money, so the
        // day's tolerance still applies.
        credited: d.paidBefore ?? 0,
        paidIn: d.paidBefore ?? 0,
        before: d.paidBefore ?? 0,
        forgiven: 0,
        pinned: stored !== undefined && d.date <= stored,
        ...(input.toleranceExemptions?.has(d.date)
          ? { exempt: input.toleranceExemptions.get(d.date)! }
          : {}),
      },
    ])
  );
  // A dispute holds a day still open. One recorded paid for good stays paid (D22): the dispute
  // neither releases its money as credit nor takes it out of the balance; an officer who agrees
  // waives the disputed ore (`dismissDispute`), which credits it.
  const isHeld = (d: RunningDay) =>
    held.has(d.date) && d.tax > 0 && !(stored !== undefined && d.date <= stored);
  const isDone = (st: Running) => {
    const remaining = st.tax - st.credited;
    // Under half an ISK is float residue, never a debt: it would read "owes 0 ISK (1 day)".
    if (remaining < RESIDUE_ISK) return true;
    if (st.paidIn <= 0) return false;
    // The tolerance forgives only the mined part: the money pays it first, so an officer's
    // charge is what is left short, and is never forgiven however small.
    const mined = Math.max(0, st.tax - Math.max(0, st.charge));
    const minedLeft = Math.max(0, mined - st.credited);
    const limit = st.exempt ?? daySettleTolerance(mined, pct);
    return remaining - minedLeft < RESIDUE_ISK && minedLeft <= limit;
  };
  const queue = pools.payments.map((p) => ({
    paymentId: p.paymentId,
    days: [] as DayAmount[],
    left: p.left,
  }));
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
  let credit = pay(corrections, 'correction');
  credit += pay(pools.paymentPool, 'payment');
  pay(pools.writeOffPool, 'writeOff'); // a leftover is dropped, never credit

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
    // A day recorded paid stays closed: an exemption sets what a day still open may forgive, and
    // never reopens one recorded paid (nor counts its charge twice, here and in the pool).
    const pinned = st.pinned;
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
    // A held day is not due.
    // What money paid of it before a checkpoint was billed and paid there.
    if (!dayHeld) billed += Math.max(0, st.tax) - st.before;
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

  const oldest = [...owedDates].sort()[0];
  return {
    byDay,
    applications: {
      // What is left in the queue is the credit: the payments after the last day they reached.
      payments: queue.map(({ left, ...p }) => ({ ...p, credit: Math.max(0, left) })),
      corrections: corrected,
      writeOffs: forgivenDays,
    },
    credit,
    balanceBeforePayments: billed - corrections - forgivenTotal - writtenOffTotal,
    paidThrough,
    owes: owedAmount > 0 && oldest ? { amount: owedAmount, days: owedDates.size, oldest } : null,
  };
}
