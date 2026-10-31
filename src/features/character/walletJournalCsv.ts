import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import { journalRefKey, type JournalRow } from '@/engine/journalNetting';
import type { WalletTransactionCommon } from '@/esi/endpoints';
import { journalRefLabel } from './journalRefLabel';
import { dailyGoalMessageIdOf, dailyGoalName } from './dailyGoal';
import { exportFlag } from '@/lib/exportFlag';

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
 *
 * The cells' sub-lines are columns too: whether the line is between the
 * pilot's own Characters, a daily goal payout's goal by name, and (given
 * `fills`, the page's own line-to-fill link) the market item a line paid for or
 * was paid by, with side, quantity and unit price.
 */
export function walletJournalCsvColumns(
  t: CsvTranslate,
  {
    characterName,
    playerName,
    fills,
  }: {
    characterName?: (characterId: number) => string;
    playerName?: (entry: JournalRow) => string;
    fills?: {
      linkFor: (entry: JournalRow) => WalletTransactionCommon | undefined;
      nameFor: (typeId: number) => string;
    };
  } = {}
): CsvColumn<JournalRow>[] {
  const fillColumns: CsvColumn<JournalRow>[] = fills
    ? [
        {
          header: t('wallet.item'),
          value: (entry) => {
            const fill = fills.linkFor(entry);
            return fill ? fills.nameFor(fill.type_id) : null;
          },
        },
        {
          header: t('wallet.side'),
          value: (entry) => {
            const fill = fills.linkFor(entry);
            return fill ? t(fill.is_buy ? 'wallet.buy' : 'wallet.sell') : null;
          },
        },
        { header: t('wallet.quantity'), value: (entry) => fills.linkFor(entry)?.quantity ?? null },
        {
          header: t('wallet.unitPrice'),
          value: (entry) => fills.linkFor(entry)?.unit_price ?? null,
        },
      ]
    : [];
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
    {
      header: t('wallet.journalBetweenMarker'),
      value: (entry) => exportFlag(t, entry.internal === true),
    },
    {
      header: t('wallet.dailyGoal'),
      value: (entry) => {
        const goalId = dailyGoalMessageIdOf(entry);
        return goalId === null ? null : (dailyGoalName(goalId, t) ?? t('wallet.dailyGoal'));
      },
    },
    ...fillColumns,
  ];
}
