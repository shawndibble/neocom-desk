import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import { journalRefKey, type JournalRow } from '@/engine/journalNetting';
import type { WalletTransactionCommon } from '@/esi/endpoints';
import { journalRefLabel } from './journalRefLabel';
import { walletTransactionsCsvColumns } from './walletTransactionsCsv';
import { dailyGoalMessageIdOf, dailyGoalName } from './dailyGoal';
import { exportFlag } from '@/lib/exportFlag';

/**
 * CSV columns for the wallet journal: the table's columns plus the detail fields it has no room for
 * (tax, reason, context and party ids), blank rather than 0 when ESI omitted them. `characterName`,
 * `playerName` and `fills` add the Character, Player and linked-fill columns.
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
  // The transactions export's own Item, Side, Quantity and Unit price, read off the line's linked fill.
  const fillHeaders = new Set([
    t('wallet.item'),
    t('wallet.side'),
    t('wallet.quantity'),
    t('wallet.unitPrice'),
  ]);
  const fillColumns: CsvColumn<JournalRow>[] = fills
    ? walletTransactionsCsvColumns(t, fills.nameFor)
        .filter((column) => fillHeaders.has(column.header))
        .map((column) => ({
          header: column.header,
          value: (entry) => {
            const fill = fills.linkFor(entry);
            return fill ? column.value(fill) : null;
          },
        }))
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
