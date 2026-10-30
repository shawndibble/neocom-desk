/**
 * The two loose match tiers that sit below exact/prefix/substring (#5644),
 * shared by `rankedSearch` and the command palette's item scan so both agree.
 * Inputs are already lowercased.
 */

/** A digit 1–5 and the roman numeral word it stands for, in both directions. */
const NUMERAL_PAIRS: ReadonlyMap<string, string> = new Map(
  (['i', 'ii', 'iii', 'iv', 'v'] as const).flatMap((roman, i) => [
    [String(i + 1), roman],
    [roman, String(i + 1)],
  ])
);

/** Lowercased name split into words on anything that is not a letter or digit. */
export function wordsOf(lower: string): string[] {
  return lower.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/** The query as words, or `null` when it has none to match. */
export function queryTokens(q: string): string[] | null {
  const tokens = wordsOf(q);
  return tokens.length ? tokens : null;
}

/**
 * Every query token is a prefix of some name word, any order; a digit 1–5
 * also matches its roman numeral word and the reverse ("gyro 2" finds
 * "Gyrostabilizer II").
 */
export function tokenPrefixMatch(words: readonly string[], tokens: readonly string[]): boolean {
  return tokens.every((token) => {
    const alt = NUMERAL_PAIRS.get(token);
    return words.some((word) => word.startsWith(token) || word === alt);
  });
}

/** Dashes, spaces and every other separator removed ("TTP-2B" → "ttp2b"). */
export function compactKey(lower: string): string {
  return wordsOf(lower).join('');
}
