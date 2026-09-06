/**
 * Which wallet-journal entries could be the in-game payment behind a moon
 * mining settle-up (issue #523, "link previous payments"): outgoing ISK of
 * the kinds a renter actually pays a landlord with, recent, amount-matching
 * ones first. Pure — the Settle-up dialog feeds it the journal the app
 * already caches for the paying character(s).
 */
import type { WalletJournalEntry } from '@/esi/endpoints';
import { DAY_MS } from '@/lib/age';

/** ESI `ref_type`s that move ISK from the pilot to another party by hand: a direct donation, or paying a contract. */
export const PAYMENT_REF_TYPES: ReadonlySet<string> = new Set([
  'player_donation',
  'contract_price',
  'contract_price_payment_corp',
  'contract_deposit',
]);

/** How far back a payment is worth offering — a settle-up is recorded within days of paying, not months. */
const LOOKBACK_DAYS = 30;
/**
 * How long after a Mining Ledger Entry a payment can still plausibly be
 * settling it (issue #540). Deliberately used asymmetrically — see
 * `withinLinkWindow` in `paymentLinks.ts`: a pilot pays *after* mining, so an
 * entry dated well past its payment is not a match however close the amounts.
 */
export const LINK_WINDOW_DAYS = 14;
/** Enough to find the right entry without the list becoming a second wallet journal. */
const MAX_CANDIDATES = 8;

/** True when two ISK figures agree within half a percent (or one ISK, whichever is larger). */
export function amountsMatch(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(1, b * 0.005);
}

/** True when `entry`'s magnitude is within half a percent (or one ISK, whichever is larger) of `amount`. */
export function amountMatches(entry: WalletJournalEntry, amount: number): boolean {
  if (entry.amount === undefined) return false;
  return amountsMatch(Math.abs(entry.amount), amount);
}

export function findPaymentCandidates(
  entries: readonly WalletJournalEntry[],
  amount: number,
  now: Date
): WalletJournalEntry[] {
  const cutoff = now.getTime() - LOOKBACK_DAYS * DAY_MS;
  return entries
    .filter(
      (entry) =>
        PAYMENT_REF_TYPES.has(entry.ref_type) &&
        entry.amount !== undefined &&
        entry.amount < 0 &&
        Date.parse(entry.date) >= cutoff
    )
    .sort((a, b) => {
      const matchA = amountMatches(a, amount) ? 0 : 1;
      const matchB = amountMatches(b, amount) ? 0 : 1;
      return matchA - matchB || b.date.localeCompare(a.date);
    })
    .slice(0, MAX_CANDIDATES);
}
