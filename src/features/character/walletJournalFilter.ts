import type { WalletJournalEntry } from '@/esi/endpoints';

/**
 * The journal filter bar's state (issue #413): a raw ESI `ref_type`, an
 * inclusive `YYYY-MM-DD` date range, and free text. `null` (or an empty
 * string for `text`) means that criterion is inactive — every field inactive
 * is the identity filter.
 */
export interface WalletJournalFilter {
  refType: string | null;
  startDate: string | null;
  endDate: string | null;
  text: string;
}

export const EMPTY_WALLET_JOURNAL_FILTER: WalletJournalFilter = {
  refType: null,
  startDate: null,
  endDate: null,
  text: '',
};

/**
 * Every active criterion is ANDed. String comparison on the `YYYY-MM-DD`
 * slice of `entry.date` is sufficient for the range check — ISO dates sort
 * lexicographically the same as chronologically.
 */
export function filterWalletJournal(
  entries: readonly WalletJournalEntry[],
  filter: WalletJournalFilter
): WalletJournalEntry[] {
  const text = filter.text.trim().toLowerCase();
  return entries.filter((entry) => {
    if (filter.refType !== null && entry.ref_type !== filter.refType) return false;
    const day = entry.date.slice(0, 10);
    if (filter.startDate !== null && day < filter.startDate) return false;
    if (filter.endDate !== null && day > filter.endDate) return false;
    if (text !== '' && !entry.description.toLowerCase().includes(text)) return false;
    return true;
  });
}

/** The distinct raw `ref_type` values present in a journal, sorted. */
export function journalRefTypes(entries: readonly WalletJournalEntry[]): string[] {
  return [...new Set(entries.map((entry) => entry.ref_type))].sort();
}
