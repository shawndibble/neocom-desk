/**
 * Shared ranked substring search for typeahead lists (Market type search,
 * Skill Plan skill picker). Case-insensitive. Ranks exact > prefix >
 * substring on the caller's primary field; a row matched only via a
 * `secondary` field ranks below every primary match, in one flat bucket (no
 * exact/prefix/substring sub-ranking within it — the primary field owns
 * ranking, secondary fields only widen what counts as a match). Alphabetical
 * by the primary field (original case) within a rank. Empty/whitespace-only
 * query returns `[]` — load-bearing so callers never dump their whole list.
 * Pure and synchronous — callers debounce keystrokes themselves.
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

  const matches: { item: T; rank: number; primaryText: string }[] = [];
  for (const item of items) {
    const primaryText = options.primary(item);
    const rank = rankOf(item, options, primaryText.toLowerCase(), q);
    if (rank !== NO_MATCH) matches.push({ item, rank, primaryText });
  }

  matches.sort((a, b) =>
    a.rank !== b.rank ? a.rank - b.rank : a.primaryText.localeCompare(b.primaryText)
  );

  return matches.slice(0, options.limit).map((m) => m.item);
}
