/**
 * The wallet journal's shared hooks and constants, for `/wallet` and
 * `/corp/wallet` alike — the table itself is `WalletJournalTable.tsx`. Apart
 * so that file exports only a component (fast refresh).
 */
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { DataTableColumn } from '@/components/ui';
import type { WalletTransactionCommon } from '@/esi/endpoints';
import { iskToneClass } from '@/features/character/format';
import { journalRefKey, type JournalLine, type JournalRow } from '@/engine/journalNetting';
import { journalRefLabel } from '@/features/character/journalRefLabel';
import { journalDescriptionText } from '@/features/character/dailyGoal';
import { JournalDescriptionCell } from '@/features/character/JournalDescriptionCell';
import {
  filterWalletJournal,
  journalRefTypes,
  type WalletJournalFilter,
} from '@/features/character/walletJournalFilter';
import { formatIsk } from '@/lib/isk';
import { useTimeZone } from '@/lib/timeFormat';
import { splitTimestamp } from '@/lib/timestamp';

/** The journal's default order, newest first. */
export const JOURNAL_SORT = { columnId: 'date', direction: 'desc' } as const;
/** Every sortable journal column, for `useUrlSort` to validate `?journal.sort=` against. */
export const JOURNAL_SORT_COLUMN_IDS = [
  'date',
  'character',
  'refType',
  'description',
  'amount',
  'balance',
];

/** The one spelling of an item id from a resolved-names map; an unresolved id reads as `Type #id`. */
export function typeNameLookup(names: ReadonlyMap<number, string>): (typeId: number) => string {
  return (typeId) => names.get(typeId) ?? `Type #${typeId}`;
}

/** Filter a journal, then memoize the result and the ref types its dropdown offers. */
export function useJournalFilterResult(
  journal: readonly JournalRow[],
  filter: WalletJournalFilter
): {
  filteredJournal: JournalRow[];
  /** Filtered by date range and text only: the ref-type breakdown ignores the ref-type filter. */
  breakdownJournal: JournalRow[];
  /** Filtered by ref type and text but not date: the chart draws its own date axis. */
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
  return { filteredJournal, breakdownJournal, chartJournal, refTypeOptions };
}

/**
 * One column set for both journals — ESI returns the same schema for each —
 * built per journal only because each links its lines to its own fills.
 */
export function useJournalColumnsBuilder(): (
  linkFor: (entry: JournalLine) => WalletTransactionCommon | undefined,
  nameFor: (typeId: number) => string,
  miningTaxHrefFor?: (entry: JournalLine) => string | undefined,
  /** Set in the multi-Character view: adds a Character column. */
  characterNameFor?: (characterId: number) => string,
  /** Set on the corp journal: adds a Player column, who did it. */
  playerNameFor?: (entry: JournalRow) => string
) => DataTableColumn<JournalRow>[] {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  return useCallback(
    (
      linkFor: (entry: JournalLine) => WalletTransactionCommon | undefined,
      nameFor: (typeId: number) => string,
      miningTaxHrefFor?: (entry: JournalLine) => string | undefined,
      characterNameFor?: (characterId: number) => string,
      playerNameFor?: (entry: JournalRow) => string
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
              className: 'max-sm:px-1 sm:whitespace-nowrap',
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
              className: 'max-sm:px-1 sm:whitespace-nowrap',
              headerClassName: 'max-sm:px-1',
              render: playerNameFor,
              sortValue: playerNameFor,
            },
          ]
        : [];
      return [
        {
          id: 'date',
          header: t('wallet.date'),
          className: 'whitespace-nowrap text-text-dim max-sm:px-1',
          headerClassName: 'max-sm:px-1',
          // Date over time on a phone, freeing width for Description; one line from `sm` up.
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
          // Wraps onto two lines on a phone so Amount stays on screen; one line from `sm` up.
          className: 'max-sm:px-1 sm:whitespace-nowrap',
          headerClassName: 'max-sm:px-1',
          render: (entry) => journalRefLabel(journalRefKey(entry), t),
          sortValue: (entry) => journalRefLabel(journalRefKey(entry), t),
        },
        ...playerColumn,
        {
          id: 'description',
          header: t('wallet.description'),
          // Wraps in its cell on a phone, capped so Amount stays inside the viewport.
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
                  miningTaxHref={miningTaxHrefFor?.(entry)}
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
          align: 'right',
          className: 'tabular-nums max-sm:px-1',
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
          align: 'right',
          className: 'tabular-nums text-text-dim',
          render: (entry) =>
            entry.balance !== undefined ? formatIsk(entry.balance) : t('common.unknown'),
          sortValue: (entry) => entry.balance,
        },
      ];
    },
    [t, timeZone]
  );
}
