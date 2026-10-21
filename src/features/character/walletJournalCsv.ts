import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import { journalRefKey, type JournalRow } from '@/engine/journalNetting';
import { journalRefLabel } from './journalRefLabel';

/**
 * CSV columns for the wallet journal: date, ref type, description, amount,
 * balance, then the detail fields the DataTable has no room for — tax,
 * reason, context id/type, and both party ids (issue #413). Mirrors the
 * DataTable columns on the Wallet page for the shared prefix, so the same
 * i18n keys serve both. `date` passes through as the raw ISO string — the
 * table's `toLocaleString()` rendering is display-only. Every optional field
 * is blank (not 0) when ESI omitted it; an actual 0 stays 0 (`??`, not `||`).
 * The ref type reads as the table's does (PLEX bought / sold); `characterName`
 * adds the multi-Character view's Character column after the date;
 * `playerName` adds the corp journal's Player column after the ref type.
 */
export function walletJournalCsvColumns(
  t: CsvTranslate,
  characterName?: (characterId: number) => string,
  playerName?: (entry: JournalRow) => string
): CsvColumn<JournalRow>[] {
  const characterColumn: CsvColumn<JournalRow>[] = characterName
    ? [
        {
          header: t('wallet.balanceCharacterColumn'),
          value: (entry) =>
            entry.characterId === undefined ? null : characterName(entry.characterId),
        },
      ]
    : [];
  const playerColumn: CsvColumn<JournalRow>[] = playerName
    ? [{ header: t('wallet.playerColumn'), value: (entry) => playerName(entry) || null }]
    : [];
  return [
    { header: t('wallet.date'), value: (entry) => entry.date },
    ...characterColumn,
    { header: t('wallet.refType'), value: (entry) => journalRefLabel(journalRefKey(entry), t) },
    ...playerColumn,
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
