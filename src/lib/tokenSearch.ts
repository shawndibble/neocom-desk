const NUMERAL_PAIRS: ReadonlyMap<string, string> = new Map(
  (['i', 'ii', 'iii', 'iv', 'v'] as const).flatMap((roman, i) => [
    [String(i + 1), roman],
    [roman, String(i + 1)],
  ])
);

export function searchKey(text: string): string {
  return text.toLowerCase().replace(/['"\u2018\u2019\u201C\u201D]/g, '');
}

export function wordsOf(lower: string): string[] {
  return lower.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

export function queryTokens(q: string): string[] | null {
  const tokens = wordsOf(q);
  return tokens.length ? tokens : null;
}

export function tokenPrefixMatch(words: readonly string[], tokens: readonly string[]): boolean {
  return tokens.every((token) => {
    const alt = NUMERAL_PAIRS.get(token);
    return words.some((word) => word.startsWith(token) || word === alt);
  });
}

export function compactKey(lower: string): string {
  return wordsOf(lower).join('');
}

export function tokenPrefixMatchText(lower: string, tokens: readonly string[]): boolean {
  if (!tokens.every((token) => NUMERAL_PAIRS.has(token) || lower.includes(token))) return false;
  return tokenPrefixMatch(wordsOf(lower), tokens);
}
