import { parsePercent } from '@/lib/parsePercent';
import { earliestRateStart } from '@/engine/corpTaxBook/rates';

/**
 * The rule a new dated rate must meet, shared by every place an officer sets one (Settings >
 * Rates, a moon's page): a percentage from 0 to 100, starting no more than 30 days back
 * (`earliestRateStart`). The server also refuses a day an issued late notice already lists.
 */
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
