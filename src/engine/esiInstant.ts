/**
 * `Date.parse` of an ESI timestamp, as `null` rather than `NaN`.
 *
 * Shared by both board adapters. A `NaN` deadline sorts unpredictably and
 * compares false against every severity threshold, so it must not reach an
 * engine at all — a rule worth asserting in one place rather than in each
 * adapter that happens to remember it.
 */
export function parseInstant(iso: string | undefined): number | null {
  if (iso === undefined) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}
