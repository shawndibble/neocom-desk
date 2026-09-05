import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { WalletJournalEntry } from '@/esi/endpoints';
import { humanizeRefType } from './format';

/**
 * CSV columns for the wallet journal: date, ref type, description, amount,
 * balance, then the detail fields the DataTable has no room for — tax,
 * reason, context id/type, and both party ids (issue #413). Mirrors the
 * DataTable columns on the Wallet page for the shared prefix, so the same
 * i18n keys serve both. `date` passes through as the raw ISO string — the
 * table's `toLocaleString()` rendering is display-only. Every optional field
 * is blank (not 0) when ESI omitted it; an actual 0 stays 0 (`??`, not `||`).
 */
export function walletJournalCsvColumns(t: CsvTranslate): CsvColumn<WalletJournalEntry>[] {
  return [
    { header: t('wallet.date'), value: (entry) => entry.date },
    { header: t('wallet.refType'), value: (entry) => humanizeRefType(entry.ref_type) },
    { header: t('wallet.description'), value: (entry) => entry.description },
    { header: t('wallet.amount'), value: (entry) => entry.amount ?? null },
    { header: t('wallet.balanceCol'), value: (entry) => entry.balance ?? null },
    { header: t('wallet.tax'), value: (entry) => entry.tax ?? null },
    { header: t('wallet.reason'), value: (entry) => entry.reason ?? null },
    { header: t('wallet.contextId'), value: (entry) => entry.context_id ?? null },
    { header: t('wallet.contextIdType'), value: (entry) => entry.context_id_type ?? null },
    { header: t('wallet.firstPartyId'), value: (entry) => entry.first_party_id ?? null },
    { header: t('wallet.secondPartyId'), value: (entry) => entry.second_party_id ?? null },
  ];
}
