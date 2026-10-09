/**
 * How wide EVE's chat draws each character, in pixels at font size 12, so the
 * Survey chat message can pad its box to one pixel width. The chat font is
 * proportional (an `i` is 4px, an `m` 10px), so counting characters leaves the
 * box's right edge ragged.
 *
 * Measured by pasting `║` + one character ten or twenty times + `║` into chat
 * and measuring the screenshot, once per letter. The lowercase and uppercase
 * alphabets and the digits add up to their measured whole rows. The corners
 * `╔ ╗ ╚ ╝` were not measured on their own: they take the width of `═` and `║`
 * (8px), which the rows ending in a corner are consistent with. A character not
 * listed counts as a digit (7px). A different chat font size scales every width,
 * so the padding is exact only at the size this was measured at.
 */
const WIDTHS: Record<string, number> = {
  ' ': 7,
  '═': 8,
  '║': 8,
  '╔': 8,
  '╗': 8,
  '╚': 8,
  '╝': 8,
  '█': 8,
  '░': 8,
  '·': 4,
  ':': 4,
  '.': 4,
  ',': 4,
  "'": 4,
  '/': 7,
  '~': 7,
  '-': 7,
  '%': 10,
  '(': 6,
  ')': 6,
  '[': 6,
  ']': 6,
};

const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const LOWER_PX = [7, 7, 6, 7, 7, 5, 7, 7, 4, 4, 6, 4, 10, 7, 7, 7, 7, 5, 7, 5, 7, 6, 10, 7, 7, 7];
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const UPPER_PX = [8, 8, 7, 8, 7, 7, 8, 8, 4, 6, 7, 6, 8, 8, 8, 7, 8, 8, 8, 6, 8, 8, 12, 8, 8, 6];

[...LOWER].forEach((c, i) => (WIDTHS[c] = LOWER_PX[i]));
[...UPPER].forEach((c, i) => (WIDTHS[c] = UPPER_PX[i]));

const DEFAULT_PX = 7;

export function textWidth(text: string): number {
  let px = 0;
  for (const c of text) px += WIDTHS[c] ?? DEFAULT_PX;
  return px;
}
