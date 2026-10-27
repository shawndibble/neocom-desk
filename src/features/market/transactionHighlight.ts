/**
 * Which transaction row a "sell order filled" alert points at.
 *
 * The alert knows the *item*, not the transaction: ESI's wallet transactions
 * carry no order id, so there is no key linking the order that filled to the
 * rows that paid it out. The best available answer is the newest sell of that
 * item — which, for the fill the pilot was just told about, is the row they
 * were sent here to read. A large order fills as several transactions; those
 * sort adjacently by date, so landing on the newest lands on the group.
 *
 * Pure: no fetch, no DOM, no clock. `TransactionsPanel` does the scrolling.
 */
import type { WalletTransactionCommon } from '@/esi/endpoints';

/**
 * The `?highlight=` value is an item id in a query string, which Market
 * already has one reading of — re-exported under this module's own name so
 * the panel reads it from the module that owns the rule, without a second
 * spelling of "positive integer or nothing" appearing in the codebase.
 */
export { parsePositiveInt as parseHighlightTypeId } from '@/engine/market/urlState';

export type HighlightableTransaction = Pick<
  WalletTransactionCommon,
  'transaction_id' | 'type_id' | 'is_buy' | 'date'
>;

export function highlightedTransactionId(
  rows: readonly HighlightableTransaction[],
  typeId: number | null
): number | null {
  if (typeId === null) return null;
  let best: HighlightableTransaction | null = null;
  for (const row of rows) {
    if (row.is_buy || row.type_id !== typeId) continue;
    // Ties broken on the id rather than left to input order: the panel sorts
    // its own rows, and a highlight that moved with that sort would pulse a
    // different row on a reload.
    if (
      best === null ||
      row.date > best.date ||
      (row.date === best.date && row.transaction_id > best.transaction_id)
    ) {
      best = row;
    }
  }
  return best?.transaction_id ?? null;
}
