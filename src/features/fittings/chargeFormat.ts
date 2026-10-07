/**
 * A Charge Picker price, exact: "62", "1,240", "12,500". A per-unit price is
 * small enough to read whole, and DESIGN.md §6c allows no compact ISK
 * formatter on screen without the exact value one hover away.
 */
export function formatIsk(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}
