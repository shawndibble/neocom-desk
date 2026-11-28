const HEADER_CHAR_RATIO = 1.15;
const HEADER_EXTRA_CHARS = 3;
const SORT_GUTTER_CHARS = 2.5;

export function fitColumnWidth(valueChars: Iterable<number>, header: string): string {
  const headerChars = Math.ceil(header.length * HEADER_CHAR_RATIO) + HEADER_EXTRA_CHARS;
  let widest = headerChars;
  for (const chars of valueChars) widest = Math.max(widest, chars + SORT_GUTTER_CHARS);
  return `${widest}ch`;
}
