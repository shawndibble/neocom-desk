/**
 * Ranked substring search for typeahead lists. Case-insensitive. Exact >
 * prefix > substring on `primary`; a `secondary`-only match lands in one flat
 * bucket below all of them — secondary fields widen what matches, they don't
 * rank. Alphabetical by `primary` within a rank. Empty query returns `[]`,
 * load-bearing so callers never dump their whole list. Pure and synchronous;
 * callers debounce keystrokes themselves.
 *
 * Two looser tiers rank below everything above (#5644): every query word a
 * prefix of some name word in any order, a digit 1–5 matching its roman
 * numeral ("gyro 2" finds "Gyrostabilizer II"); and, with `ignoreSeparators`,
 * dashes and spaces ignored on both sides ("ttp2b" finds "TTP-2B").
 */
import { compactKey, queryTokens, tokenPrefixMatchText } from './tokenSearch';

export interface RankedSearchOptions<T> {
  primary: (item: T) => string;
  secondary?: readonly ((item: T) => string)[];
  /** Adds the separator-insensitive tier — for names with dashes, such as systems. */
  ignoreSeparators?: boolean;
  limit: number;
}

const PRIMARY_EXACT = 0;
const PRIMARY_PREFIX = 1;
const PRIMARY_SUBSTRING = 2;
const SECONDARY_ONLY = 3;
const TOKEN_PREFIX = 4;
const SEPARATOR_INSENSITIVE = 5;
const NO_MATCH = -1;

/**
 * `secondary` is only consulted when the primary field misses — this runs
 * over every candidate on every keystroke, so the secondary fields are not
 * extracted for the common case.
 */
function rankOf<T>(
  item: T,
  options: RankedSearchOptions<T>,
  primaryLower: string,
  q: string,
  tokens: readonly string[] | null,
  qCompact: string
) {
  if (primaryLower === q) return PRIMARY_EXACT;
  if (primaryLower.startsWith(q)) return PRIMARY_PREFIX;
  if (primaryLower.includes(q)) return PRIMARY_SUBSTRING;
  if (options.secondary?.some((field) => field(item).toLowerCase().includes(q))) {
    return SECONDARY_ONLY;
  }
  if (tokens && tokenPrefixMatchText(primaryLower, tokens)) return TOKEN_PREFIX;
  if (qCompact && compactKey(primaryLower).includes(qCompact)) return SEPARATOR_INSENSITIVE;
  return NO_MATCH;
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
  const tokens = queryTokens(q);
  const qCompact = options.ignoreSeparators ? compactKey(q) : '';
  const buckets: { item: T; primaryText: string }[][] = [[], [], [], [], [], []];
  for (const item of items) {
    const primaryText = options.primary(item);
    const rank = rankOf(item, options, primaryText.toLowerCase(), q, tokens, qCompact);
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
