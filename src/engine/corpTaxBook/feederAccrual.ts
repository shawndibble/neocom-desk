import { computeAssignmentValue } from '../miningTax/valuation';
import { isDayCovered, type CoveragePeriod } from './coverage';
import { effectiveOwnerRate, type OwnerRateEntry } from './ownerRate';
import type { ObservedMiningEntry } from './types';

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
 * `corpTaxBooks/{collector}/feeders/{feederCorp}/payouts/{id}`, written only by
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

/** Accrual over already-valued days: the part mirrored in `functions/`. */
export function accrueValuedDays(
  days: readonly FeederValuedDay[],
  rules: FeederAccrualRules
): { byDay: FeederAccrualDay[]; accrued: number } {
  const byDay: FeederAccrualDay[] = [];
  for (const { date, value } of [...days].sort((x, y) => x.date.localeCompare(y.date))) {
    if (!isDayCovered(rules.coveragePeriods, date) || !rules.isBillable(date)) continue;
    if (isSettledOn(rules.modeChanges, date)) continue;
    const rate = effectiveOwnerRate(rules.ownerRateHistory, date);
    if (!rate) continue;
    byDay.push({ date, value, pct: rate.pct, due: (value * rate.pct) / 100 });
  }
  return { byDay, accrued: byDay.reduce((sum, d) => sum + d.due, 0) };
}

export function accrueFeeder(input: FeederAccrualInput): {
  byDay: FeederAccrualDay[];
  accrued: number;
} {
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
 * (credit too, so a credit is never overstated). Settled otherwise keeps no
 * balance: nothing is shown or owed (the accrued history is kept by the caller).
 */
export function feederBalance(
  accrued: number,
  payouts: readonly Pick<FeederPayout, 'amount' | 'notAPayout'>[],
  settledOtherwise = false
): { balance: number; display: BalanceDisplay } {
  if (settledOtherwise) return { balance: 0, display: { kind: 'none', isk: 0 } };
  const paid = payouts.reduce((sum, p) => (p.notAPayout ? sum : sum + p.amount), 0);
  const balance = accrued - paid;
  const isk = Math.floor(Math.abs(balance));
  const kind = isk === 0 ? 'even' : balance > 0 ? 'owed' : 'credit';
  return { balance, display: { kind, isk } };
}

/** Whether the feeder appears on the pay list: owed whole ISK. Settled otherwise has no balance, so never. */
export function onPayList(balance: { display: BalanceDisplay }): boolean {
  return balance.display.kind === 'owed';
}
