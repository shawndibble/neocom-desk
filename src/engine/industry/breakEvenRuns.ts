import { MAX_JOB_RUNS } from './types';

/** The most runs a plan can hold; trials past it would price identically. */
export const BREAK_EVEN_MAX_RUNS = MAX_JOB_RUNS;

/**
 * A run count, at or above `currentRuns`, where profit is not negative —
 * the smallest one when profit only rises with runs. Profit is not linear in
 * runs (ME rounding, a blueprint bought once, sourcing tiers), so this probes
 * `profitAt` rather than solving an equation: double until profit is reached,
 * then bisect. A profitable pocket between two doublings can be missed. `null`
 * when profit is unknown or no probe reaches zero within `BREAK_EVEN_MAX_RUNS`.
 */
export function breakEvenRuns(
  profitAt: (runs: number) => number | null,
  currentRuns: number
): number | null {
  const reached = (runs: number): boolean | null => {
    const profit = profitAt(runs);
    return profit === null ? null : profit >= 0;
  };

  const start = Math.max(1, Math.round(currentRuns));
  const atStart = reached(start);
  if (atStart === null) return null;
  if (atStart) return start;

  let lo = start; // known losing
  let hi = start;
  for (;;) {
    if (hi >= BREAK_EVEN_MAX_RUNS) return null;
    hi = Math.min(hi * 2, BREAK_EVEN_MAX_RUNS);
    const ok = reached(hi);
    if (ok === null) return null;
    if (ok) break;
    lo = hi;
  }

  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    const ok = reached(mid);
    if (ok === null) return null;
    if (ok) hi = mid;
    else lo = mid;
  }
  return hi;
}
