import { computeAssignmentValue } from '../miningTax/valuation';
import { dayClosesAt } from './billable';
import { isDayCovered, type CoveragePeriod } from './coverage';
import { effectiveOwnerRate, type OwnerRateEntry } from './ownerRate';
import type { ObservedMiningEntry } from './types';
import { utcDay } from '@/engine/localDay';

export type FeederMode = 'normal' | 'settled-otherwise';

export interface FeederModeChange {
  from: string;
  mode: FeederMode;
}

export type PayoutStatus = 'recorded' | 'waiting-for-journal' | 'matched';

export interface FeederPayout {
  date: string;
  amount: number;
  method: 'donation' | 'other';
  status: PayoutStatus;
  journalRef?: number;
  notAPayout: boolean;
  unconfirmed?: boolean;
  disputedAt?: number;
}

export interface FeederAccrualDay {
  date: string;
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
  isBillable: (day: string) => boolean;
  pricesOn: (date: string) => ReadonlyMap<number, number>;
}

export function feederBillableRule(
  lastReadWellAt: number | undefined,
  graceHours: number
): (day: string) => boolean {
  return (day) =>
    lastReadWellAt !== undefined && lastReadWellAt >= Date.parse(dayClosesAt(day, graceHours));
}

export interface FeederRulesRecord {
  joinedAt: number;
  mode?: FeederMode;
  requestedRatePct?: number;
  agreedRatePct?: number;
  ownerRateHistory?: OwnerRateEntry[];
  modeChanges?: FeederModeChange[];
}

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
  pending: FeederValuedDay[];
}

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

export function onPayList(balance: { display: BalanceDisplay }): boolean {
  return balance.display.kind === 'owed';
}
