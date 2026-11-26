import { parsePercent } from '@/lib/parsePercent';
import { earliestRateStart } from '@/engine/corpTaxBook/rates';

export function datedRateReady(pct: string, effectiveFrom: string, today: string): boolean {
  const value = parsePercent(pct);
  return (
    value !== null &&
    value >= 0 &&
    value <= 100 &&
    effectiveFrom !== '' &&
    effectiveFrom >= earliestRateStart(today)
  );
}
