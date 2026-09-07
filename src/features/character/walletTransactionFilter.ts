/**
 * The filter behind the corp wallet's Transactions tab (issue #570).
 *
 * A sibling of `walletJournalFilter.ts`, deliberately the same shape — the two
 * bars sit one tab apart and a manager should not have to learn two idioms.
 * The one real difference is what free text searches. A journal line carries
 * its own `description`, so its filter is self-contained; a transaction carries
 * only a `type_id`, so this one has to be told how the view spells that id.
 *
 * Lives beside the character filter rather than in `src/engine` for the same
 * reason that one does: it is view state for one panel, not a rule about EVE.
 * It stays pure regardless, and its tests are the specification.
 */
import type { WalletTransactionCommon } from '@/esi/endpoints';

/** Buy, sell, or don't care. */
export type TransactionSide = 'all' | 'buy' | 'sell';

export interface WalletTransactionFilter {
  side: TransactionSide;
  /** Inclusive `YYYY-MM-DD`, compared against the row's own date prefix. */
  startDate: string | null;
  /** Inclusive `YYYY-MM-DD`. */
  endDate: string | null;
  text: string;
}

export const EMPTY_WALLET_TRANSACTION_FILTER: WalletTransactionFilter = {
  side: 'all',
  startDate: null,
  endDate: null,
  text: '',
};

/**
 * The rows this filter keeps, in the order they arrived.
 *
 * `nameFor` is the *same* function the table's item column renders with, and
 * that is the contract rather than a convenience: a `type_id` whose name never
 * resolved is drawn as `Type #99999`, so searching for `99999` has to find it.
 * Handing the filter its own name map would let a pending resolve quietly
 * remove rows the eye can see, which is the one failure mode a search box
 * must not have.
 */
export function filterWalletTransactions<T extends WalletTransactionCommon>(
  transactions: readonly T[],
  filter: WalletTransactionFilter,
  nameFor: (typeId: number) => string
): T[] {
  const text = filter.text.trim().toLowerCase();
  return transactions.filter((txn) => {
    if (filter.side === 'buy' && !txn.is_buy) return false;
    if (filter.side === 'sell' && txn.is_buy) return false;
    // ESI dates are ISO-8601 in UTC, so the first ten characters are the day
    // and a string compare is a date compare — the same trick the journal's
    // own range uses.
    const day = txn.date.slice(0, 10);
    if (filter.startDate !== null && day < filter.startDate) return false;
    if (filter.endDate !== null && day > filter.endDate) return false;
    if (text !== '' && !nameFor(txn.type_id).toLowerCase().includes(text)) return false;
    return true;
  });
}

/**
 * How many filters are set, for the mobile sheet's badge.
 *
 * Text is left out on purpose: its box stays on screen at every width, so it
 * is never one of the filters the badge is there to account for. Same rule as
 * `activeWalletJournalFilterCount`.
 */
export function activeWalletTransactionFilterCount(filter: WalletTransactionFilter): number {
  let count = 0;
  if (filter.side !== 'all') count += 1;
  if (filter.startDate !== null) count += 1;
  if (filter.endDate !== null) count += 1;
  return count;
}
