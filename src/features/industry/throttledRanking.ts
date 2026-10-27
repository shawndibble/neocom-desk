/**
 * Progress-time ranking for a list that grows in chunks (`useOpportunities`):
 * re-ranking the whole list after every chunk is quadratic over the batch,
 * and each new array re-sorts and re-renders the table. This ranks on the
 * first call, then at most once per `intervalMs`, handing back the *same*
 * array in between so a consumer keyed on its identity does nothing. The
 * caller ranks the finished list itself — this is only for the progress
 * frames, and may lag the newest rows by up to one interval.
 */
export function throttledRanker<Row, Ranked>(
  rank: (rows: readonly Row[]) => Ranked[],
  intervalMs: number,
  now: () => number = () => performance.now()
): (rows: readonly Row[]) => Ranked[] {
  let last: Ranked[] | null = null;
  let lastAt = 0;
  return (rows) => {
    const at = now();
    if (last === null || at - lastAt >= intervalMs) {
      last = rank(rows);
      lastAt = at;
    }
    return last;
  };
}
