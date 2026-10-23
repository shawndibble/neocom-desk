/** A status pill's printed text, and whether an overlap mark sits beside it. */
export interface StatusPillText {
  text: string;
  marked?: boolean;
}

/** The overlap mark beside a corp pill takes about two characters of room. */
const OVERLAP_MARK_CHARS = 2;

/**
 * [longest text in characters, width class]: a pill prints small caps at about
 * half a rem a character, inside 0.75rem of its own padding and the cell's
 * 1.5rem, so a class is the first whose width clears its row's text. The first
 * row's floor is the header, "Status" and its sort arrow (checked at 6rem).
 * Literal classes, because one built at run time would never be generated.
 */
const TIERS: readonly (readonly [number, string])[] = [
  [6, 'sm:w-24'],
  [9, 'sm:w-28'],
  [11, 'sm:w-32'],
  [13, 'sm:w-36'],
  [17, 'sm:w-44'],
];
const WIDEST = 'sm:w-48';

/**
 * The Status column's width for the pills on screen. Open and History share
 * their columns so they line up, so the caller passes both tables' pills.
 */
export function statusColumnWidthClass(pills: readonly StatusPillText[]): string {
  const longest = Math.max(
    0,
    ...pills.map((p) => p.text.length + (p.marked ? OVERLAP_MARK_CHARS : 0))
  );
  return TIERS.find(([max]) => longest <= max)?.[1] ?? WIDEST;
}
