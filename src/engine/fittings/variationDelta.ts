import { NUMERIC_FIELDS, round, type StatChangeKey } from './fittingStatFields';
import type { FittingStats } from './types';

export type { FittingStatKey, StatChangeKey } from './fittingStatFields';
export { FLAG_STATS, STAT_DIGITS, changeVerdict } from './fittingStatFields';

export interface StatChange {
  key: StatChangeKey;
  before: number;
  after: number;
}

export interface FittingStatsDelta {
  changes: StatChange[];
  count: number;
}

export function capacitorChange(before: FittingStats, after: FittingStats): StatChange | null {
  const metric = (capacitor: FittingStats['capacitor']) =>
    capacitor.stable ? capacitor.stablePercentage : -capacitor.depletesInSeconds;

  if (before.capacitor.stable !== after.capacitor.stable) {
    return { key: 'capacitor', before: metric(before.capacitor), after: metric(after.capacitor) };
  }
  const b = round(metric(before.capacitor), 0);
  const a = round(metric(after.capacitor), 0);
  return b === a ? null : { key: 'capacitor', before: b, after: a };
}

export function diffFittingStats(before: FittingStats, after: FittingStats): FittingStatsDelta {
  const changes: StatChange[] = [];
  for (const field of NUMERIC_FIELDS) {
    if (field.compareOnly) continue;
    const b = round(field.value(before), field.digits);
    const a = round(field.value(after), field.digits);
    if (b !== a) changes.push({ key: field.key, before: b, after: a });
  }
  const cap = capacitorChange(before, after);
  if (cap) changes.push(cap);
  return { changes, count: changes.length };
}
