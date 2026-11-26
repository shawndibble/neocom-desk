import { compactKey, queryTokens, searchKey, tokenPrefixMatchText } from './tokenSearch';

export interface RankedSearchOptions<T> {
  primary: (item: T) => string;
  secondary?: readonly ((item: T) => string)[];
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
  if (options.secondary?.some((field) => searchKey(field(item)).includes(q))) {
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
  const q = searchKey(query.trim());
  if (!q) return [];

  const tokens = queryTokens(q);
  const qCompact = options.ignoreSeparators ? compactKey(q) : '';
  const buckets: { item: T; primaryText: string }[][] = [[], [], [], [], [], []];
  for (const item of items) {
    const primaryText = options.primary(item);
    const rank = rankOf(item, options, searchKey(primaryText), q, tokens, qCompact);
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
