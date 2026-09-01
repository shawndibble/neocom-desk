import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { WalletJournalEntry } from '@/esi/endpoints';
import { humanizeRefType } from './format';

/**
 * CSV columns for the wallet journal: date, ref type, description, amount,
 * balance. Mirrors the DataTable columns on the Wallet page, so the same
 * i18n keys serve both. `date` passes through as the raw ISO string — the
 * table's `toLocaleString()` rendering is display-only. `amount`/`balance`
 * are blank (not 0) when ESI omitted them, matching the optional field; an
 * actual 0 stays 0 (`??`, not `||`).
 */
export function walletJournalCsvColumns(t: CsvTranslate): CsvColumn<WalletJournalEntry>[] {
  return [
    { header: t('wallet.date'), value: (entry) => entry.date },
    { header: t('wallet.refType'), value: (entry) => humanizeRefType(entry.ref_type) },
    { header: t('wallet.description'), value: (entry) => entry.description },
    { header: t('wallet.amount'), value: (entry) => entry.amount ?? null },
    { header: t('wallet.balanceCol'), value: (entry) => entry.balance ?? null },
  ];
}
