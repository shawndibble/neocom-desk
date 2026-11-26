import { MAX_JOB_RUNS } from './types';

export const BREAK_EVEN_MAX_RUNS = MAX_JOB_RUNS;

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

  let lo = start;
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
