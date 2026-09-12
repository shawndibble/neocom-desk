/**
 * Shared constants for matching a real-world payment to a moon mining
 * settle-up (issue #523, "link previous payments"). The Settle-up dialog
 * itself no longer searches the wallet journal at pay time — ESI's journal
 * lags too far behind for a just-sent payment to show up yet — so this module
 * only keeps what `paymentLinks.ts`'s "paying backwards" matcher still needs
 * once that payment actually appears.
 */

/** ESI `ref_type`s that move ISK from the pilot to another party by hand: a direct donation, or paying a contract. */
export const PAYMENT_REF_TYPES: ReadonlySet<string> = new Set([
  'player_donation',
  'contract_price',
  'contract_price_payment_corp',
  'contract_deposit',
]);

/**
 * How long after a Mining Ledger Entry a payment can still plausibly be
 * settling it (issue #540). Deliberately used asymmetrically — see
 * `withinLinkWindow` in `paymentLinks.ts`: a pilot pays *after* mining, so an
 * entry dated well past its payment is not a match however close the amounts.
 */
export const LINK_WINDOW_DAYS = 14;

/** True when two ISK figures agree within half a percent (or one ISK, whichever is larger). */
export function amountsMatch(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(1, b * 0.005);
}
