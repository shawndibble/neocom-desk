import { earliestRateStart } from '@/engine/corpTaxBook/rates';

/**
 * The rule a new dated rate must meet, shared by every place an officer sets one (Settings >
 * Rates, a moon's page): a percentage from 0 to 100, starting no more than 30 days back
 * (`earliestRateStart`). The server also refuses a day an issued late notice already lists.
 */
export function datedRateReady(pct: string, effectiveFrom: string, today: string): boolean {
  return (
    pct.trim() !== '' &&
    Number(pct) >= 0 &&
    Number(pct) <= 100 &&
    effectiveFrom !== '' &&
    effectiveFrom >= earliestRateStart(today)
  );
}
