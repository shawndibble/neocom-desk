/**
 * A Miner's account (#6294, decisions 20261117-033049 and 20261117-060555): the one record of what
 * a Miner owes. Every closed day is billed as it closes, and the Miner's money pays the oldest
 * unpaid day first, by amount (a donation cannot name a day or a moon). Credit is only money
 * ahead of every billed day. Late notices only say what was asked (`LateNotice`): they take no
 * money and settle nothing.
 *
 * A day a payment reaches is paid when the money falls short of its tax by no more than the
 * book's tolerance, a percent of the day with no ISK floor; the gap is written off. A day no
 * payment reached stays owed in full.
 *
 * Recomputed from the Miner's closed-through checkpoint, or the whole history when there is none
 * (decision 20261120-235011); a day at or before the stored paid-through stays paid even when
 * money is later taken back (D22), and takes no more money. Days are settled a date at a time:
 * what one date's lines owe together.
 */
import {
  lateNoticeStanding,
  type LateNoticeLine,
  type LateNoticeStanding,
} from '../../../functions/src/corpTaxBookLateNotice';
import type {
  CheckpointOwedDay,
  RunningAccountCheckpoint,
} from '../../../functions/src/corpTaxBookCheckpoint';
import { countedPayments, paymentNet, type TaxPayment } from './payments';

/** The default per-day tolerance, in percent of the day's tax. */
export const DAY_SETTLE_TOLERANCE_PCT = 0.5;

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
export interface RunningAccountWriteOff {
  id: string;
  amount: number;
  /** ISO instant it was recorded: a checkpoint holds every write-off up to its date. */
  at: string;
}

/** Everything one Miner's account is built from. */
export interface MinerRunningAccountInput {
  /** The Miner's closed days, in any order; several entries for a date add up. */
  days: readonly RunningDay[];
  /** The Miner's Tax Payments. */
  payments: readonly TaxPayment[];
  /** Officer write-offs not reversed. They apply after every payment; a leftover is dropped. */
  writeOffs?: readonly RunningAccountWriteOff[];
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
  /**
   * The account's closed-through checkpoint: no day on or before its `through` is billed again,
   * and no money dated on or before it is counted again. Its owed days are still owed, oldest
   * first, and its credit pays the next days.
   */
  checkpoint?: RunningAccountCheckpoint;
}

/** The UTC day of an ISO instant: which side of a checkpoint money falls. */
const dayOf = (at: string) => at.slice(0, 10);

/** The queue slot of a checkpoint's credit: the oldest money, and no payment of the Miner's. */
const OPENING_CREDIT = '\u0000checkpoint';

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

/**
 * A Miner's Running account: what every screen, late notice and total reads for what a Miner
 * owes. Built from plain data (`build`) and never stored: the book stores only its inputs, and
 * what it records of an account (paid through, the figures a pay page was told) is plain JSON.
 */
export class MinerRunningAccount {
  private constructor(
    /** What it was built from: a preview or a checkpoint builds on it again. */
    readonly input: MinerRunningAccountInput,
    /** What became of each closed day. */
    readonly byDay: ReadonlyMap<string, DaySettlement>,
    /** The same money as `byDay`'s `credited`, split by where it came from. */
    readonly applications: RunningAccountApplications,
    /** Money ahead of every billed day. */
    readonly credit: number,
    /** Everything billed less everything paid, forgiven or written off; negative is credit. */
    readonly balance: number,
    /**
     * The newest day with nothing owed on or before it (days an open dispute holds neither stop
     * nor advance it), never before the stored one; null while no day is paid yet.
     */
    readonly paidThrough: string | null,
    readonly owes: RunningAccountOwes | null
  ) {}

  static build(input: MinerRunningAccountInput): MinerRunningAccount {
    const cp = input.checkpoint;
    const after = (date: string) => cp === undefined || date > cp.through;
    const counted = countedPayments(input.payments, input.startDate).filter((p) =>
      after(dayOf(p.at))
    );
    const paid = counted.reduce((sum, p) => sum + paymentNet(p), 0);
    const opening = Math.max(0, cp?.credit ?? 0);
    const days: RunningDay[] = [
      ...(cp?.owed ?? []).map((d) => ({
        date: d.date,
        tax: d.remaining,
        ...(d.charge ? { charge: d.charge } : {}),
      })),
      ...input.days.filter((d) => after(d.date)),
    ];
    const settled = settleDays(
      { ...input, days },
      {
        extraCorrections: 0,
        paymentPool: opening + paid,
        payments: [
          ...(opening > 0 ? [{ paymentId: OPENING_CREDIT, left: opening }] : []),
          ...counted
            .filter((p) => paymentNet(p) > 0)
            .map((p) => ({ paymentId: p.id, left: paymentNet(p) })),
        ],
        writeOffPool: (input.writeOffs ?? [])
          .filter((w) => after(dayOf(w.at)))
          .reduce((sum, w) => sum + Math.max(0, w.amount), 0),
      }
    );
    // Once none of the checkpoint's owed days is left, every day through it is paid.
    const closed =
      cp !== undefined &&
      (cp.paidThrough !== null || cp.owed.length > 0) &&
      cp.owed.every((d) => {
        const day = settled.byDay.get(d.date);
        return !day || day.settled || day.held;
      });
    const floor = closed ? cp.through : (cp?.paidThrough ?? null);
    const paidThrough =
      floor !== null && (settled.paidThrough === null || settled.paidThrough < floor)
        ? floor
        : settled.paidThrough;
    return new MinerRunningAccount(
      input,
      settled.byDay,
      {
        ...settled.applications,
        payments: settled.applications.payments.filter((p) => p.paymentId !== OPENING_CREDIT),
      },
      settled.credit,
      settled.balanceBeforePayments - opening - paid,
      paidThrough,
      settled.owes
    );
  }

  /**
   * The account closed through `through` (decision 20261120-235011): built from its days and its
   * money dated on or before that day only, so later money never reaches into it.
   */
  static checkpoint(
    input: MinerRunningAccountInput,
    minerId: string,
    through: string,
    recorded: { at: string; by?: number }
  ): RunningAccountCheckpoint {
    const upTo = (date: string) => date <= through;
    const days = input.days.filter((d) => upTo(d.date));
    const account = MinerRunningAccount.build({
      ...input,
      days,
      payments: input.payments.filter((p) => upTo(dayOf(p.at))),
      ...(input.writeOffs ? { writeOffs: input.writeOffs.filter((w) => upTo(dayOf(w.at))) } : {}),
    });
    const charges = new Map(
      runningDaysFromLines([
        ...(input.checkpoint?.owed ?? []).map((d) => ({ ...d, tax: d.remaining })),
        ...days,
      ]).map((d) => [d.date, d.charge ?? 0])
    );
    const owed = [...account.byDay]
      .filter(([, d]) => !d.settled)
      .map(([date, d]): CheckpointOwedDay => {
        const charge = Math.min(charges.get(date) ?? 0, d.remaining);
        return { date, remaining: d.remaining, ...(charge > 0 ? { charge } : {}) };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
    const billed = account.byDay.size > 0 || input.checkpoint !== undefined;
    const nothingOwed = owed.every((d) => account.byDay.get(d.date)?.held);
    return {
      minerId,
      through,
      owed,
      credit: account.credit,
      balance: account.balance,
      paidThrough: billed && nothingOwed ? through : account.paidThrough,
      at: recorded.at,
      ...(recorded.by !== undefined ? { by: recorded.by } : {}),
    };
  }

  /** What became of one closed day; undefined for a day the account does not bill. */
  day(date: string): DaySettlement | undefined {
    return this.byDay.get(date);
  }

  /** The dates still owed, oldest first: neither settled nor held by an open dispute. */
  owedDates(): string[] {
    return [...this.byDay]
      .filter(([, d]) => !d.settled && !d.held)
      .map(([date]) => date)
      .sort();
  }

  /** Where a late notice's days stand on this account. */
  standingOf(notice: {
    lines: readonly Pick<LateNoticeLine, 'date' | 'tax'>[];
  }): LateNoticeStanding {
    return lateNoticeStanding(notice, this.byDay);
  }

  /** What is still owed of one line of a day: its share of the date's remainder, none while held. */
  owedOf(date: string, tax: number): number {
    const day = this.byDay.get(date);
    if (!day || day.held || day.tax <= 0) return 0;
    return (day.remaining * tax) / day.tax;
  }

  /**
   * The newest day that may be stored as paid for good (D22): every day up to it is settled, held
   * by no dispute, before `today`, and priced at a saved close-of-day price. A day with no price
   * has no tax and reads as paid, so storing past one would forgive it; a live price is a guess
   * that moves. Null while no day qualifies. Only an officer's client can compute it: the server
   * has no prices. The stored day never moves back (`paidThrough` holds it).
   */
  closableThrough(
    /** The account's days, with whether every line was priced at a saved close-of-day price. */
    days: readonly { date: string; savedPrices: boolean }[],
    /** The UTC date of the read; ore for it is still coming in. */
    today: string
  ): string | null {
    if (this.paidThrough === null) return null;
    let through: string | null = null;
    for (const d of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
      const day = this.byDay.get(d.date);
      if (d.date >= today || !d.savedPrices || !day || day.held || !day.settled) break;
      through = d.date;
    }
    return through;
  }
}

/** The running days a Miner's unbilled lines make: one per date, oldest first. */
export function runningDaysFromLines(
  lines: readonly {
    date: string;
    tax: number;
    /** A `correction` line's positive tax is an officer's charge. */
    kind?: string;
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

/** The money `settleDays` spreads over the days, oldest day first. */
interface DayPools {
  /** Credit from outside the days that is not a payment: it pays days without the tolerance. */
  extraCorrections: number;
  /** The payments' money for the days, paid in one go (a day's tolerance can close mid-run). */
  paymentPool: number;
  /** Each payment's share of `paymentPool`, oldest first: only says whose money each slice was. */
  payments: readonly { paymentId: string; left: number }[];
  /** What officer write-offs may forgive, after every payment; a leftover is dropped. */
  writeOffPool: number;
}

/** The part of the input that says how days settle; the money comes in `DayPools`. */
type DaysInput = Pick<
  MinerRunningAccountInput,
  'days' | 'heldDays' | 'storedPaidThrough' | 'dayTolerancePct' | 'toleranceExemptions'
>;

/** What `settleDays` makes of the days, before the caller takes the payments off the balance. */
interface SettledDays {
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
  /** An officer's limit on what this day may forgive; none uses the book's tolerance. */
  exempt?: number;
};

/** Settles the days from the given pools: corrections first, then payments, then officer write-offs. */
function settleDays(input: DaysInput, pools: DayPools): SettledDays {
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
    balanceBeforePayments: billed - corrections - forgivenTotal - writtenOffTotal,
    paidThrough,
    owes: owedAmount > 0 && oldest ? { amount: owedAmount, days: owedDates.size, oldest } : null,
  };
}
