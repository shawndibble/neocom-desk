/**
 * Short column labels for the Compare drawer's Attributes matrix: the words
 * every compared item's name shares ("Large Shield Extender") move into one
 * caption, so each column keeps only what tells it apart ("II", "Caldari
 * Navy"). Five variants then fit a 390px phone side by side instead of each
 * full name wrapping to four lines in a 4rem column.
 *
 * Whole words only, matched case-sensitively as the SDE spells them, and a
 * word repeated within a name is stripped only as many times as every name
 * repeats it. If stripping would leave any name empty (one item's name is
 * nothing but the shared words), the full names are kept: a blank column
 * header is worse than a long one.
 */
export interface CompareLabels {
  /** The words every name shares, in the first name's order; null when nothing was stripped. */
  shared: string | null;
  /** One label per input name, in input order. */
  labels: string[];
}

function wordCounts(words: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1);
  return counts;
}

export function shortCompareLabels(names: readonly string[]): CompareLabels {
  const unchanged: CompareLabels = { shared: null, labels: [...names] };
  if (names.length < 2) return unchanged;

  const split = names.map((name) => name.split(/\s+/).filter(Boolean));
  const common = wordCounts(split[0]);
  for (const words of split.slice(1)) {
    const counts = wordCounts(words);
    for (const [word, count] of common) {
      common.set(word, Math.min(count, counts.get(word) ?? 0));
    }
  }
  if (![...common.values()].some((count) => count > 0)) return unchanged;

  /** Marks each word as shared (stripped) or distinguishing (kept). */
  function sharedFlags(words: readonly string[]): boolean[] {
    const remaining = new Map(common);
    return words.map((word) => {
      const left = remaining.get(word) ?? 0;
      if (left === 0) return false;
      remaining.set(word, left - 1);
      return true;
    });
  }

  const labels = split.map((words) => {
    const flags = sharedFlags(words);
    return words.filter((_, i) => !flags[i]).join(' ');
  });
  if (labels.some((label) => label === '')) return unchanged;

  const firstFlags = sharedFlags(split[0]);
  return { shared: split[0].filter((_, i) => firstFlags[i]).join(' '), labels };
}
