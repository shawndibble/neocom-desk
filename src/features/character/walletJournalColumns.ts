/**
 * Wallet journal's optional columns and device-local visible-columns
 * preference. One setting for both journals: the personal and corp panels draw
 * the same column set. `refType` is not in the catalog — it titles each card on
 * a phone and names what every line is, so the table can never lose it.
 */
import { createColumnVisibilitySetting } from '@/lib/columnVisibility';

export const WALLET_JOURNAL_COLUMN_IDS = ['date', 'description', 'amount', 'balance'] as const;

export type WalletJournalColumnId = (typeof WALLET_JOURNAL_COLUMN_IDS)[number];

export const useVisibleWalletJournalColumns = createColumnVisibilitySetting({
  key: 'walletJournalVisibleColumns',
  ids: WALLET_JOURNAL_COLUMN_IDS,
});
