/**
 * Average ISK per mined day for the Mining Yield Overview tab (issue #671; basis
 * changed from per-hour).
 *
 * ESI's mining ledger has no intra-day timestamp (CONTEXT.md's Mining Ledger
 * Entry), so no per-hour rate can be measured — a calendar-hour divisor made a
 * short session read tiny. This divides total value by the number of distinct
 * days that have a mining entry: a provable per-day figure, not a guess. See
 * docs/context/decisions/ for the recorded scope call.
 */

/** `totalValue` over the distinct days in `dates`. Null for no dates — never a fabricated rate. */
export function iskPerMinedDay(totalValue: number, dates: readonly string[]): number | null {
  const days = new Set(dates).size;
  if (days === 0) return null;
  return totalValue / days;
}
