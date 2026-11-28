import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { DataTableColumn } from '@/components/ui';
import { COL_DATETIME } from '@/components/ui/dataTableWidths';
import type { WalletTransactionCommon } from '@/esi/endpoints';
import { iskToneClass } from '@/features/character/format';
import { journalRefKey, type JournalLine, type JournalRow } from '@/engine/journalNetting';
import { journalRefLabel } from '@/features/character/journalRefLabel';
import { journalDescriptionText } from '@/features/character/dailyGoal';
import {
  JournalDescriptionCell,
  type MiningTaxEntryLink,
} from '@/features/character/JournalDescriptionCell';
import { CharacterLink } from '@/features/entities';
import {
  filterWalletJournal,
  journalRefTypes,
  type WalletJournalFilter,
} from '@/features/character/walletJournalFilter';
import { formatIsk } from '@/lib/isk';
import { useTimeZone } from '@/lib/timeFormat';
import { splitTimestamp } from '@/lib/timestamp';

export const JOURNAL_SORT = { columnId: 'date', direction: 'desc' } as const;
export const JOURNAL_SORT_COLUMN_IDS = [
  'date',
  'character',
  'refType',
  'player',
  'description',
  'amount',
  'balance',
];

export function typeNameLookup(names: ReadonlyMap<number, string>): (typeId: number) => string {
  return (typeId) => names.get(typeId) ?? `Type #${typeId}`;
}

export function useJournalFilterResult(
  journal: readonly JournalRow[],
  filter: WalletJournalFilter
): {
  filteredJournal: JournalRow[];
  breakdownJournal: JournalRow[];
  partyBreakdownJournal: JournalRow[];
  chartJournal: JournalRow[];
  refTypeOptions: string[];
} {
  const { t } = useTranslation();
  const filteredJournal = useMemo(
    () => filterWalletJournal(journal, filter, (entry) => journalDescriptionText(entry, t)),
    [journal, filter, t]
  );
  const breakdownJournal = useMemo(
    () =>
      filter.refType === null
        ? filteredJournal
        : filterWalletJournal(journal, { ...filter, refType: null }, (entry) =>
            journalDescriptionText(entry, t)
          ),
    [journal, filter, filteredJournal, t]
  );
  const partyBreakdownJournal = useMemo(
    () =>
      filter.party === null
        ? filteredJournal
        : filterWalletJournal(journal, { ...filter, party: null }, (entry) =>
            journalDescriptionText(entry, t)
          ),
    [journal, filter, filteredJournal, t]
  );
  const chartJournal = useMemo(
    () =>
      filter.startDate === null && filter.endDate === null
        ? filteredJournal
        : filterWalletJournal(journal, { ...filter, startDate: null, endDate: null }, (entry) =>
            journalDescriptionText(entry, t)
          ),
    [journal, filter, filteredJournal, t]
  );
  const refTypeOptions = useMemo(() => journalRefTypes(journal), [journal]);
  return { filteredJournal, breakdownJournal, partyBreakdownJournal, chartJournal, refTypeOptions };
}

export function useJournalColumnsBuilder(): (
  linkFor: (entry: JournalLine) => WalletTransactionCommon | undefined,
  nameFor: (typeId: number) => string,
  miningTaxEntriesFor?: (entry: JournalLine) => readonly MiningTaxEntryLink[] | undefined,
  characterNameFor?: (characterId: number) => string,
  playerNameFor?: (entry: JournalRow) => string,
  lossCharacterFor?: (entry: JournalRow) => number | undefined
) => DataTableColumn<JournalRow>[] {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  return useCallback(
    (
      linkFor: (entry: JournalLine) => WalletTransactionCommon | undefined,
      nameFor: (typeId: number) => string,
      miningTaxEntriesFor?: (entry: JournalLine) => readonly MiningTaxEntryLink[] | undefined,
      characterNameFor?: (characterId: number) => string,
      playerNameFor?: (entry: JournalRow) => string,
      lossCharacterFor?: (entry: JournalRow) => number | undefined
    ): DataTableColumn<JournalRow>[] => {
      const nameOf = (entry: JournalRow) =>
        characterNameFor && entry.characterId !== undefined
          ? characterNameFor(entry.characterId)
          : '';
      const characterColumn: DataTableColumn<JournalRow>[] = characterNameFor
        ? [
            {
              id: 'character',
              header: t('wallet.balanceCharacterColumn'),
              width: '22ch',
              className: 'max-sm:px-1 sm:truncate',
              headerClassName: 'max-sm:px-1',
              render: nameOf,
              sortValue: nameOf,
            },
          ]
        : [];
      const playerColumn: DataTableColumn<JournalRow>[] = playerNameFor
        ? [
            {
              id: 'player',
              header: t('wallet.playerColumn'),
              width: '22ch',
              className: 'max-sm:px-1 sm:truncate',
              headerClassName: 'max-sm:px-1',
              render: (entry: JournalRow) =>
                entry.playerId === undefined ? (
                  ''
                ) : (
                  <CharacterLink id={entry.playerId}>{playerNameFor(entry)}</CharacterLink>
                ),
              sortValue: playerNameFor,
            },
          ]
        : [];
      return [
        {
          id: 'date',
          header: t('wallet.date'),
          width: COL_DATETIME,
          className: 'whitespace-nowrap text-text-dim max-sm:px-1',
          headerClassName: 'max-sm:px-1',
          render: (entry) => {
            const { date, time } = splitTimestamp(new Date(entry.date), timeZone);
            const body = date.trimEnd();
            return (
              <>
                <span className="max-sm:block">{body}</span>
                <span className="max-sm:hidden">{date.slice(body.length)}</span>
                {time && <span className="max-sm:block">{time}</span>}
              </>
            );
          },
          sortValue: (entry) => entry.date,
        },
        ...characterColumn,
        {
          id: 'refType',
          header: t('wallet.refType'),
          width: '24ch',
          className: 'max-sm:px-1 sm:truncate',
          headerClassName: 'max-sm:px-1',
          render: (entry) => journalRefLabel(journalRefKey(entry), t),
          sortValue: (entry) => journalRefLabel(journalRefKey(entry), t),
        },
        ...playerColumn,
        {
          id: 'description',
          header: t('wallet.description'),
          minWidth: '32ch',
          className:
            'max-sm:max-w-40 max-sm:whitespace-normal max-sm:px-1 [overflow-wrap:anywhere]',
          headerClassName: 'max-sm:px-1',
          render: (entry) => {
            const transaction = linkFor(entry);
            return (
              <>
                <JournalDescriptionCell
                  entry={entry}
                  transaction={transaction}
                  itemName={transaction ? nameFor(transaction.type_id) : ''}
                  miningTaxEntries={miningTaxEntriesFor?.(entry)}
                  lossCharacterId={lossCharacterFor?.(entry)}
                  player={
                    playerNameFor && entry.playerId !== undefined
                      ? { id: entry.playerId, name: playerNameFor(entry) }
                      : undefined
                  }
                />
                {entry.internal && (
                  <span className="block text-xs text-text-dim">
                    {t('wallet.journalBetweenMarker')}
                  </span>
                )}
              </>
            );
          },
          sortValue: (entry) => journalDescriptionText(entry, t),
        },
        {
          id: 'amount',
          header: t('wallet.amount'),
          width: '15ch',
          align: 'right',
          className: 'tabular-nums whitespace-nowrap max-sm:px-1',
          headerClassName: 'max-sm:px-1',
          cellClassName: (entry) =>
            entry.internal
              ? 'text-text-dim'
              : entry.amount !== undefined
                ? iskToneClass(entry.amount)
                : '',
          render: (entry) =>
            entry.amount !== undefined ? formatIsk(entry.amount) : t('common.unknown'),
          sortValue: (entry) => entry.amount,
        },
        {
          id: 'balance',
          header: t('wallet.balanceCol'),
          width: '16ch',
          align: 'right',
          className: 'tabular-nums whitespace-nowrap text-text-dim',
          render: (entry) =>
            entry.balance !== undefined ? formatIsk(entry.balance) : t('common.unknown'),
          sortValue: (entry) => entry.balance,
        },
      ];
    },
    [t, timeZone]
  );
}
