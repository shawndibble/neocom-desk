/**
 * Ranked substring search for typeahead lists. Case-insensitive. Exact >
 * prefix > substring on `primary`; a `secondary`-only match lands in one flat
 * bucket below all of them — secondary fields widen what matches, they don't
 * rank. Alphabetical by `primary` within a rank. Empty query returns `[]`,
 * load-bearing so callers never dump their whole list. Pure and synchronous;
 * callers debounce keystrokes themselves.
 */
export interface RankedSearchOptions<T> {
  primary: (item: T) => string;
  secondary?: readonly ((item: T) => string)[];
  limit: number;
}

const PRIMARY_EXACT = 0;
const PRIMARY_PREFIX = 1;
const PRIMARY_SUBSTRING = 2;
const SECONDARY_ONLY = 3;
const NO_MATCH = -1;

/**
 * `secondary` is only consulted when the primary field misses — this runs
 * over every candidate on every keystroke, so the secondary fields are not
 * extracted for the common case.
 */
function rankOf<T>(item: T, options: RankedSearchOptions<T>, primaryLower: string, q: string) {
  if (primaryLower === q) return PRIMARY_EXACT;
  if (primaryLower.startsWith(q)) return PRIMARY_PREFIX;
  if (primaryLower.includes(q)) return PRIMARY_SUBSTRING;
  const secondary = options.secondary;
  if (!secondary) return NO_MATCH;
  return secondary.some((field) => field(item).toLowerCase().includes(q))
    ? SECONDARY_ONLY
    : NO_MATCH;
}

export function rankedSearch<T>(
  items: Iterable<T>,
  query: string,
  options: RankedSearchOptions<T>
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  // Bucketed by rank rather than one sort over every match: a one-character
  // query matches most of a 9,000-entry catalogue, and sorting all of it to
  // return `limit` is most of the cost. Lower buckets usually fill the limit,
  // so the big substring bucket is never sorted.
  const buckets: { item: T; primaryText: string }[][] = [[], [], [], []];
  for (const item of items) {
    const primaryText = options.primary(item);
    const rank = rankOf(item, options, primaryText.toLowerCase(), q);
    if (rank !== NO_MATCH) buckets[rank].push({ item, primaryText });
  }

  const results: T[] = [];
  for (const bucket of buckets) {
    if (results.length >= options.limit) break;
    bucket.sort((a, b) => a.primaryText.localeCompare(b.primaryText));
    for (const match of bucket) {
      if (results.length >= options.limit) break;
      results.push(match.item);
    }
  }
  return results;
}
