import { createColumnVisibilitySetting } from '@/lib/columnVisibility';

export const WALLET_JOURNAL_COLUMN_IDS = ['date', 'description', 'amount', 'balance'] as const;

export type WalletJournalColumnId = (typeof WALLET_JOURNAL_COLUMN_IDS)[number];

export const WALLET_JOURNAL_PHONE_OFF_BY_DEFAULT: readonly WalletJournalColumnId[] = ['balance'];

export const useVisibleWalletJournalColumns = createColumnVisibilitySetting({
  key: 'walletJournalVisibleColumns',
  ids: WALLET_JOURNAL_COLUMN_IDS,
});
