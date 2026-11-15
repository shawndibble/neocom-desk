import { computeAssignmentValue } from '../miningTax/valuation';
import { dayClosesAt } from './billable';
import { isDayCovered, type CoveragePeriod } from './coverage';
import { effectiveOwnerRate, type OwnerRateEntry } from './ownerRate';
import type { ObservedMiningEntry } from './types';
import { utcDay } from '@/engine/localDay';

/**
 * What the Collector owes a feeder for ore mined at the feeder's refineries.
 * Independent of collection: no miner debt, write-off, rebill or statement
 * enters here. Unrounded throughout; only `feederBalance`'s display rounds.
 */

export type FeederMode = 'normal' | 'settled-otherwise';

/** A mode switch, effective from `from` (a UTC day, inclusive). */
export interface FeederModeChange {
  from: string;
  mode: FeederMode;
}

export type PayoutStatus = 'recorded' | 'waiting-for-journal' | 'matched';

/**
 * `corps/{collector}/feeders/{feederCorp}/payouts/{id}`, written only by
 * callables. A journal match only attaches to a payout that already counts.
 */
export interface FeederPayout {
  /** UTC day the ISK was sent. */
  date: string;
  /** Whole ISK. */
  amount: number;
  method: 'donation' | 'other';
  status: PayoutStatus;
  /** The wallet journal entry id, present once matched. */
  journalRef?: number;
  /** Set when the officer decides a journal entry is not a payout. */
  notAPayout: boolean;
  /**
   * A donation to the moon owner without the payout reference (#6209): recorded as not a payout
   * until an officer confirms it either way. Absent on every other row.
   */
  unconfirmed?: boolean;
  /** When the moon owner flagged this payment as one it disputes (ms); absent when it did not. */
  disputedAt?: number;
}

export interface FeederAccrualDay {
  date: string;
  /** Ore value at 100%, as the miner's line is priced. */
  value: number;
  pct: number;
  due: number;
}

export interface FeederAccrualInput {
  feederCorporationId: number;
  entries: readonly ObservedMiningEntry[];
  coveragePeriods: readonly CoveragePeriod[];
  ownerRateHistory: readonly OwnerRateEntry[];
  modeChanges: readonly FeederModeChange[];
  /** The feeder's own Billable rule (its ledger read), see `withholdUnreadFeederDays`. */
  isBillable: (day: string) => boolean;
  pricesOn: (date: string) => ReadonlyMap<number, number>;
}

/**
 * A moon owner's own Billable rule: a day at its refineries is Billable once a good read of its
 * ledger (`lastReadWellAt`, ms) landed after the day closed. Mirrored in `functions/`.
 */
export function feederBillableRule(
  lastReadWellAt: number | undefined,
  graceHours: number
): (day: string) => boolean {
  return (day) =>
    lastReadWellAt !== undefined && lastReadWellAt >= Date.parse(dayClosesAt(day, graceHours));
}

/** What a feeder record holds of its rates and mode (the book's and the server's records fit). */
export interface FeederRulesRecord {
  joinedAt: number;
  mode?: FeederMode;
  requestedRatePct?: number;
  agreedRatePct?: number;
  ownerRateHistory?: OwnerRateEntry[];
  modeChanges?: FeederModeChange[];
}

/** The record's rate history, or entries derived from its two rate fields (dated the join day). Mirrored in `functions/`. */
export function deriveOwnerRateHistory(record: FeederRulesRecord): OwnerRateEntry[] {
  if (record.ownerRateHistory) return record.ownerRateHistory;
  const effectiveFrom = utcDay(record.joinedAt);
  const recordedAt = new Date(record.joinedAt).toISOString();
  const out: OwnerRateEntry[] = [];
  if (record.requestedRatePct !== undefined)
    out.push({ kind: 'requested', pct: record.requestedRatePct, effectiveFrom, recordedAt });
  if (record.agreedRatePct !== undefined)
    out.push({ kind: 'agreed', pct: record.agreedRatePct, effectiveFrom, recordedAt });
  return out;
}

/** The record's mode switches, or settled-otherwise from the join day when only `mode` says so. Mirrored in `functions/`. */
export function deriveModeChanges(record: FeederRulesRecord): FeederModeChange[] {
  if (record.modeChanges) return record.modeChanges;
  return record.mode === 'settled-otherwise'
    ? [{ from: utcDay(record.joinedAt), mode: 'settled-otherwise' }]
    : [];
}

export function isSettledOn(changes: readonly FeederModeChange[], day: string): boolean {
  let latest: FeederModeChange | undefined;
  for (const c of changes) if (c.from <= day && (!latest || c.from >= latest.from)) latest = c;
  return latest?.mode === 'settled-otherwise';
}

/** One day's ore value at the feeder's refineries, priced at 100%. */
export interface FeederValuedDay {
  date: string;
  value: number;
}

export type FeederAccrualRules = Omit<
  FeederAccrualInput,
  'feederCorporationId' | 'entries' | 'pricesOn'
>;

export interface FeederAccrual {
  byDay: FeederAccrualDay[];
  accrued: number;
  /**
   * Covered, Billable days with no agreed rate yet (#6209): nothing is owed for them until a
   * rate is agreed, and the first agreed rate then reaches back over them.
   */
  pending: FeederValuedDay[];
}

/** Accrual over already-valued days: the part mirrored in `functions/`. */
export function accrueValuedDays(
  days: readonly FeederValuedDay[],
  rules: FeederAccrualRules
): FeederAccrual {
  const byDay: FeederAccrualDay[] = [];
  const pending: FeederValuedDay[] = [];
  for (const { date, value } of [...days].sort((x, y) => x.date.localeCompare(y.date))) {
    if (!isDayCovered(rules.coveragePeriods, date) || !rules.isBillable(date)) continue;
    if (isSettledOn(rules.modeChanges, date)) continue;
    const rate = effectiveOwnerRate(rules.ownerRateHistory, date);
    if (!rate) {
      pending.push({ date, value });
      continue;
    }
    byDay.push({ date, value, pct: rate.pct, due: (value * rate.pct) / 100 });
  }
  return { byDay, accrued: byDay.reduce((sum, d) => sum + d.due, 0), pending };
}

export function accrueFeeder(input: FeederAccrualInput): FeederAccrual {
  const valueByDay = new Map<string, number>();
  for (const e of input.entries) {
    if (e.sourceCorporationId !== input.feederCorporationId) continue;
    const { estimatedValue } = computeAssignmentValue(e.oreLines, input.pricesOn(e.date), 100);
    valueByDay.set(e.date, (valueByDay.get(e.date) ?? 0) + estimatedValue);
  }
  const days = [...valueByDay].map(([date, value]) => ({ date, value }));
  return accrueValuedDays(days, input);
}

export type BalanceDisplay = { kind: 'owed' | 'credit' | 'even' | 'none'; isk: number };

/**
 * One running balance per feeder: accrued minus payouts received. Negative is
 * credit that later accruals absorb. The display rounds down to whole ISK
 * (credit too, so a credit is never overstated). Settled otherwise accrues
 * nothing from its effective day, but what accrued before it stays owed
 * (#6209); once nothing is owed it shows no balance (`none`).
 */
export function feederBalance(
  accrued: number,
  payouts: readonly Pick<FeederPayout, 'amount' | 'notAPayout'>[],
  settledOtherwise = false
): { balance: number; display: BalanceDisplay } {
  const paid = payouts.reduce((sum, p) => (p.notAPayout ? sum : sum + p.amount), 0);
  const balance = accrued - paid;
  const isk = Math.floor(Math.abs(balance));
  const kind = isk === 0 ? 'even' : balance > 0 ? 'owed' : 'credit';
  if (settledOtherwise && kind !== 'owed') return { balance, display: { kind: 'none', isk: 0 } };
  return { balance, display: { kind, isk } };
}

/** Whether the feeder appears on the pay list: owed whole ISK, settled otherwise or not. */
export function onPayList(balance: { display: BalanceDisplay }): boolean {
  return balance.display.kind === 'owed';
}
