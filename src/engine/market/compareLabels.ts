export interface CompareLabels {
  shared: string | null;
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
