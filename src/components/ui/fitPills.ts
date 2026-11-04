interface FitPillsInput {
  /** Each pill's rendered width, in priority order. */
  pills: readonly number[];
  /** Width of the "+N" pill that stands in for the ones left out. */
  more: number;
  /** Width of what always ends the row ("Clear all"). */
  trailing: number;
  /** The row's own width. */
  available: number;
  /** The row's gap between items. */
  gap: number;
}

/**
 * How many active-filter pills fit on one line, keeping the row from ever
 * wrapping: the first `k` pills, then a "+N" pill for the rest when any are
 * left out, then the trailing "Clear all". Pills are dropped from the end, so
 * a route's order is its priority order. The first pill always shows: where
 * even it does not fit (a narrow finder column, a phone), it shrinks and
 * truncates its text rather than leave a bare "+N" that says nothing.
 *
 * A row with no width yet (jsdom, a hidden tab, the first paint before a
 * measure) shows every pill rather than none.
 */
export function fitPills({ pills, more, trailing, available, gap }: FitPillsInput): number {
  const n = pills.length;
  if (n === 0 || available <= 0) return n;
  const widthOf = (items: readonly number[]) =>
    items.reduce((sum, width) => sum + width, 0) + gap * Math.max(items.length - 1, 0);
  if (widthOf([...pills, trailing]) <= available) return n;
  for (let k = n - 1; k > 1; k -= 1) {
    if (widthOf([...pills.slice(0, k), more, trailing]) <= available) return k;
  }
  return 1;
}
