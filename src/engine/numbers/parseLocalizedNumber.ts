/**
 * Reads one number the way a pilot's client printed it, whichever locale that
 * was: `5,100,000.00` and `5.100.000,00` are the same figure.
 *
 * It judges the number's shape alone, never the app's display setting, because
 * pasted text follows the EVE client's language, not the Number Format
 * setting. EVE prints at most two decimals, so three digits after the last
 * separator can only be a thousands group.
 *
 * - A space (any kind) or apostrophe is always a thousands mark.
 * - `.` and `,` together: the later one is the decimal, the other groups.
 * - One kind, repeated: it groups (`1.178.000`).
 * - One kind, once: three digits after it (and 1-3 before it, not `0`) make it
 *   a thousands mark (`13.812`); anything else makes it a decimal (`1,5`, `0.500`).
 *
 * `decimal` is for text the pilot typed into the app, which follows the
 * display setting: it settles the one case shape cannot, a single mark before
 * exactly three digits (`1.234`), as that mark's decimal. Pasted text passes
 * nothing.
 *
 * Answers null for anything that is not a number, never NaN, so a caller can
 * tell "not a number" from zero.
 */

export type DecimalMark = '.' | ',';

const SPACE_AND_APOSTROPHE = /[\s']/g; // \s covers no-break, thin and narrow no-break spaces
const SHAPE = /^-?[.,]?\d[\d.,]*$/;
const FIRST_GROUP = /^\d{1,3}$/;
const LATER_GROUP = /^\d{3}$/;

/** Digits grouped in threes: a 1-3 digit head, then only 3-digit groups. */
const isGrouped = (groups: string[]): boolean =>
  FIRST_GROUP.test(groups[0]) && groups.slice(1).every((group) => LATER_GROUP.test(group));

export function parseLocalizedNumber(text: string, decimal?: DecimalMark): number | null {
  const token = text.trim().replace(SPACE_AND_APOSTROPHE, '');
  if (!SHAPE.test(token)) return null;
  const sign = token.startsWith('-') ? -1 : 1;
  const unsigned = sign === -1 ? token.slice(1) : token;
  // A bare ".5" is 0.5.
  const body = /^[.,]/.test(unsigned) ? `0${unsigned}` : unsigned;

  const last = Math.max(body.lastIndexOf('.'), body.lastIndexOf(','));
  if (last === -1) return sign * Number(body);

  const mark = body[last];
  const head = body.slice(0, last);
  const tail = body.slice(last + 1);
  if (tail === '') return null;
  const other = mark === '.' ? ',' : '.';

  if (head.includes(other)) {
    // Both kinds: the last one is the decimal, the other groups the whole part.
    if (head.includes(mark) || !isGrouped(head.split(other))) return null;
    return sign * Number(`${head.replaceAll(other, '')}.${tail}`);
  }
  if (head.includes(mark)) {
    // One kind, repeated: all of it groups.
    return isGrouped([...head.split(mark), tail]) ? sign * Number(body.replaceAll(mark, '')) : null;
  }
  const thousands = tail.length === 3 && FIRST_GROUP.test(head) && head !== '0' && decimal !== mark;
  return sign * Number(thousands ? head + tail : `${head}.${tail}`);
}
