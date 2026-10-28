/** Uppercase, letter-spaced header text runs wider than a digit; the arrow and tooltip "?" take 3 more. */
const HEADER_CHAR_RATIO = 1.15;
const HEADER_EXTRA_CHARS = 3;

/**
 * Width for a Market History number column, sized to the widest value in the
 * loaded rows (not the rendered window, so virtualized rows stay aligned),
 * with the header label and its sort arrow as the floor. `ch` is one digit,
 * and the cells are `tabular-nums`, so a character count is the width.
 */
export function fitColumnWidth(valueChars: Iterable<number>, header: string): string {
  const headerChars = Math.ceil(header.length * HEADER_CHAR_RATIO) + HEADER_EXTRA_CHARS;
  let widest = headerChars;
  for (const chars of valueChars) widest = Math.max(widest, chars);
  return `${widest}ch`;
}
