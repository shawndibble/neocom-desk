/**
 * The clipboard text for a suggested order price (issue #1421): PLAIN
 * DIGITS, a `.` decimal, no thousands separators — the shape EVE's own order
 * price field accepts, unlike `formatIsk`'s comma-grouped on-screen text.
 *
 * Its own module (mirrors `iconButtonClassName.ts`'s reasoning) rather than a
 * second export off `CopyablePrice.tsx`, so that file keeps exporting only a
 * component (`react-refresh/only-export-components`).
 */

/**
 * `1233000` for a whole-ISK price, `12.34` when it carries cents. Every
 * price this module handles is already snapped to a legal tick
 * (`priceTick.ts`), so this only ever needs to drop or keep exactly two
 * decimal places, never round.
 */
export function priceClipboardText(price: number): string {
  const cents = Math.round(price * 100);
  const whole = Math.trunc(cents / 100);
  const remainder = Math.abs(cents % 100);
  return remainder === 0 ? String(whole) : `${whole}.${String(remainder).padStart(2, '0')}`;
}
