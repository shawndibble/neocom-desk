/**
 * Typo-tolerant search, the fallback for when `rankedSearch` finds nothing.
 * Case-insensitive. A query matches an item when it is within a few edits of
 * one of the item's words (or of the item's same-length leading text, for a
 * multi-word or half-typed query). Closest first, then alphabetical by
 * `primary`. Empty query returns `[]`. Pure and synchronous; only run it on
 * a miss, since it measures every candidate.
 */
export interface FuzzySearchOptions<T> {
  primary: (item: T) => string;
  limit: number;
}

/**
 * Optimal string alignment distance: insert, delete, substitute, and swap of
 * two adjacent letters each cost one edit — a swap is the commonest typo.
 */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, prev2[j - 2] + 1);
      }
      row.push(best);
    }
    prev2 = prev;
    prev = row;
  }
  return prev[b.length];
}

/** No item name is this long, and a pasted blob would make every comparison slow. */
const MAX_QUERY_LENGTH = 40;

/** Edits forgiven for a query of this length: short queries have little to spare. */
function allowedEdits(queryLength: number): number {
  if (queryLength <= 3) return 0;
  if (queryLength <= 5) return 1;
  if (queryLength <= 9) return 2;
  return 3;
}

/**
 * The query's distance to the item's name: against each word, and against the
 * name's own start, each cut to the query's length (typing is left to right,
 * so a half-typed word is compared to the same-length start of the real one).
 * The cut may be one letter longer or shorter, so a dropped or extra letter
 * in the query still lines up.
 */
function distanceToName(query: string, name: string, maxEdits: number): number {
  const candidates = [name, ...name.split(/[^a-z0-9]+/).filter(Boolean)];
  let best = Infinity;
  for (const candidate of candidates) {
    // Lengths further apart than the allowance can't be within it.
    if (Math.abs(query.length - candidate.length) <= maxEdits) {
      best = Math.min(best, editDistance(query, candidate));
    }
    for (const length of [query.length - 1, query.length, query.length + 1]) {
      if (length > 0 && length < candidate.length) {
        best = Math.min(best, editDistance(query, candidate.slice(0, length)));
      }
    }
    if (best === 0) break;
  }
  return best;
}

export function fuzzySearch<T>(
  items: Iterable<T>,
  query: string,
  options: FuzzySearchOptions<T>
): T[] {
  const q = query.trim().toLowerCase();
  if (!q || q.length > MAX_QUERY_LENGTH) return [];
  const maxEdits = allowedEdits(q.length);

  const matches: { item: T; primaryText: string; distance: number }[] = [];
  for (const item of items) {
    const primaryText = options.primary(item);
    const distance = distanceToName(q, primaryText.toLowerCase(), maxEdits);
    if (distance <= maxEdits) matches.push({ item, primaryText, distance });
  }
  matches.sort((a, b) => a.distance - b.distance || a.primaryText.localeCompare(b.primaryText));
  return matches.slice(0, options.limit).map((match) => match.item);
}
