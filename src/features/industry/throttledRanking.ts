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
