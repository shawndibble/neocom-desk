/**
 * A Miner's account (#6294, decisions 20261117-033049 and 20261117-060555): the one record of what
 * a Miner owes. Every closed day is billed as it closes, and the Miner's money pays the oldest
 * unpaid day first, by amount (a donation cannot name a day or a moon). Credit is only money
 * ahead of every billed day. Late notices only say what was asked (`notice.ts`): they take no
 * money and settle nothing.
 *
 * A day a payment reaches is paid when the money falls short of its tax by no more than the
 * book's tolerance, a percent of the day with no ISK floor; the gap is written off. A day no
 * payment reached stays owed in full.
 *
 * Recomputed from the whole history each time; a day at or before the stored paid-through stays
 * paid even when money is later taken back (D22), and takes no more money. Days are settled a
 * date at a time: what one date's lines owe together.
 */
import { countedPayments, paymentNet, SETTLE_TOLERANCE_PCT, type TaxPayment } from './allocation';

/** The default per-day tolerance, in percent of the day's tax. */
export const DAY_SETTLE_TOLERANCE_PCT = SETTLE_TOLERANCE_PCT;

/** How short of one day's tax a payment may fall and still pay it: a percent, never an ISK floor. */
export function daySettleTolerance(tax: number, pct: number = DAY_SETTLE_TOLERANCE_PCT): number {
  return (Math.max(0, tax) * pct) / 100;
}

/** One closed day on a Miner's account: the tax of every line that day. */
export interface RunningDay {
  date: string;
  tax: number;
  /** Of `tax`, what officer corrections charged: never forgiven by a day being recorded paid. */
  charge?: number;
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

/** An officer's write-off: the corporation forgave this much of what the Miner owes. */
export interface AccountWriteOff {
  id: string;
  amount: number;
  /** ISO instant it was recorded. */
  at: string;
}

/** Everything one Miner's account is built from. */
export interface AccountInput {
  /** The Miner's closed days, in any order; several entries for a date add up. */
  days: readonly RunningDay[];
  /** The Miner's Tax Payments. */
  payments: readonly TaxPayment[];
  /** Officer write-offs not reversed. They apply after every payment; a leftover is dropped. */
  writeOffs?: readonly AccountWriteOff[];
  /** The book's start date: a donation dated before it credits nothing. Hand-recorded payments always count. */
  startDate?: string;
  /** Dates an open dispute holds. */
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

/** Where one Tax Payment's money went: `days` and `credit` add up to the payment's tax. */
export interface AccountPayment {
  paymentId: string;
  /** The days it paid, oldest first; a payment never pays a held day. */
  days: DayAmount[];
  /** What no day absorbed of this payment. */
  credit: number;
}

/** A Miner's account: what every screen, notice and total reads. */
export interface MinerAccount {
  byDay: Map<string, DaySettlement>;
  /** The same money as `byDay.credited`, split by where it came from. Money a tolerance wrote off is no payment's. */
  applications: {
    /** Every counted payment that carried tax, oldest first. */
    payments: AccountPayment[];
    /** Credit that came from a negative day. */
    corrections: DayAmount[];
    /** What officer write-offs forgave, by day. */
    writeOffs: DayAmount[];
  };
  /** Money ahead of every billed day. */
  credit: number;
  /** Everything billed less everything paid, forgiven or written off; negative is credit. */
  balance: number;
  /**
   * The newest day with nothing owed on or before it (days an open dispute holds neither stop nor
   * advance it), never before the stored one; null while no day is paid yet.
   */
  paidThrough: string | null;
  /** What is owed now: the amount, how many dates it covers, the oldest. */
  owes: { amount: number; days: number; oldest: string } | null;
}

/** The running days a Miner's unbilled lines make: one per date, oldest first. */
export function runningDaysFromLines(
  lines: readonly {
    date: string;
    tax: number;
    kind?: 'mined' | 'late-ore' | 'correction';
    charge?: number;
  }[]
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

export function buildAccount(input: AccountInput): MinerAccount {
  const counted = countedPayments(input.payments, input.startDate);
  const paid = counted.reduce((sum, p) => sum + paymentNet(p), 0);
  const settled = settleDays(input, {
    extraCorrections: 0,
    paymentPool: paid,
    payments: counted
      .filter((p) => paymentNet(p) > 0)
      .map((p) => ({ paymentId: p.id, left: paymentNet(p) })),
    writeOffPool: (input.writeOffs ?? []).reduce((sum, w) => sum + Math.max(0, w.amount), 0),
  });
  return {
    byDay: settled.byDay,
    applications: settled.applications,
    credit: settled.credit,
    balance: settled.balance - paid,
    paidThrough: settled.paidThrough,
    owes: settled.owes,
  };
}

/** The money `settleDays` spreads over the days, oldest day first. */
export interface DayPools {
  /** Credit from outside the days that is not a payment: it pays days without the tolerance. */
  extraCorrections: number;
  /** The payments' money for the days, paid in one go (a day's tolerance can close mid-run). */
  paymentPool: number;
  /** Each payment's share of `paymentPool`, oldest first: only says whose money each slice was. */
  payments: readonly { paymentId: string; left: number }[];
  /** What officer write-offs may forgive, after every payment; a leftover is dropped. */
  writeOffPool: number;
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

/**
 * Settles the days from the given pools: corrections first, then payments, then officer
 * write-offs. Its `balance` is billed less what corrections, write-offs and the tolerance took,
 * before any payment: the caller takes the payments off. Shared by `buildAccount` and the legacy
 * `allocateRunningAccount` until the calendar Statement code is removed.
 */
export function settleDays(input: AccountInput, pools: DayPools): MinerAccount {
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
  let credit = pay(corrections + pools.extraCorrections, 'correction');
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
    // A held day is not due.
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
    balance: billed - corrections - forgivenTotal - writtenOffTotal,
    paidThrough,
    owes: owedAmount > 0 && oldest ? { amount: owedAmount, days: owedDates.size, oldest } : null,
  };
}
