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
/** Enough to find the right entry without the list becoming a second wallet journal. */
const MAX_CANDIDATES = 8;

/** True when `entry` is within half a percent (or one ISK, whichever is larger) of `amount`. */
export function amountMatches(entry: WalletJournalEntry, amount: number): boolean {
  if (entry.amount === undefined) return false;
  return Math.abs(Math.abs(entry.amount) - amount) <= Math.max(1, amount * 0.005);
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
