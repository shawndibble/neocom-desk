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

/** The slice of ESI's `WalletTransaction` this reads — deliberately not the whole shape. */
export interface HighlightableTransaction {
  transaction_id: number;
  type_id: number;
  is_buy: boolean;
  /** ESI's ISO instant. Compared as a string: ISO-8601 UTC sorts lexicographically. */
  date: string;
}

/**
 * The `?highlight=` query value as a type id, or null.
 *
 * Strict about what it accepts because the value comes from a URL a user can
 * edit or a link that has outlived its build: anything but a positive integer
 * is treated as "nothing to highlight" rather than searched for.
 */
export function parseHighlightTypeId(raw: string | null): number | null {
  if (raw === null || !/^[1-9][0-9]*$/.test(raw)) return null;
  const typeId = Number(raw);
  return Number.isSafeInteger(typeId) ? typeId : null;
}

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
