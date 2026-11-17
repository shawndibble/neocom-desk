/**
 * The rule a new dated rate must meet, shared by every place an officer sets one (Settings >
 * Rates, a moon's page): a percentage from 0 to 100, starting today or later, since a rate
 * never reaches back over days already mined (`isRetroactiveRate`).
 */
export function datedRateReady(pct: string, effectiveFrom: string, today: string): boolean {
  return (
    pct.trim() !== '' &&
    Number(pct) >= 0 &&
    Number(pct) <= 100 &&
    effectiveFrom !== '' &&
    effectiveFrom >= today
  );
}
