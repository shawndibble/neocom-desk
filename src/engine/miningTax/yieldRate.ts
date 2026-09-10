/**
 * ISK/hr for the Mining Yield Overview tab (issue #671).
 *
 * ESI's mining ledger has no intra-day timestamp (CONTEXT.md's Mining Ledger
 * Entry) — there is no session start/end to divide by, and inventing one
 * (a fixed "hours played per day" constant) would present a guess as a
 * measurement. Instead this divides the total value by the full wall-clock
 * span the covered dates run over — earliest date to latest date, inclusive,
 * at 24h/day — a rate over calendar time, not active mining time. See
 * docs/context/decisions/ for the recorded scope call and the UI label that
 * states this basis rather than presenting a bare "ISK/hr".
 */

/** Days from `a` to `b` inclusive of both endpoints, comparing bare date strings (no timezone parsing). */
function daysBetweenInclusive(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const utcA = Date.UTC(ay, am - 1, ad);
  const utcB = Date.UTC(by, bm - 1, bd);
  return Math.round((utcB - utcA) / 86_400_000) + 1;
}

/**
 * `totalValue` spread across the calendar hours from the earliest to the
 * latest of `dates`, inclusive. Null for no dates — never a fabricated rate
 * over a zero-length window.
 */
export function iskPerCalendarHour(totalValue: number, dates: readonly string[]): number | null {
  if (dates.length === 0) return null;
  const sorted = [...dates].sort();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const hours = daysBetweenInclusive(first, last) * 24;
  return totalValue / hours;
}
