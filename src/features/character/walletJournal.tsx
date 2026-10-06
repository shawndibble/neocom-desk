/**
 * The wallet journal's shared hooks and constants, for `/wallet` and
 * `/corp/wallet` alike — the table itself is `WalletJournalTable.tsx`. Apart
 * so that file exports only a component (fast refresh).
 */
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { DataTableColumn } from '@/components/ui';
import type { WalletJournalEntry, WalletTransactionCommon } from '@/esi/endpoints';
import { humanizeRefType, iskToneClass } from '@/features/character/format';
import { journalDescriptionText } from '@/features/character/dailyGoal';
import { JournalDescriptionCell } from '@/features/character/JournalDescriptionCell';
import {
  filterWalletJournal,
  journalRefTypes,
  type WalletJournalFilter,
} from '@/features/character/walletJournalFilter';
import { formatIsk } from '@/lib/isk';
import { useTimeZone } from '@/lib/timeFormat';
import { formatTimestamp } from '@/lib/timestamp';

/** The journal's default order, newest first. */
export const JOURNAL_SORT = { columnId: 'date', direction: 'desc' } as const;
/** Every sortable journal column, for `useUrlSort` to validate `?journal.sort=` against. */
export const JOURNAL_SORT_COLUMN_IDS = ['date', 'refType', 'description', 'amount', 'balance'];

/** The one spelling of an item id from a resolved-names map; an unresolved id reads as `Type #id`. */
export function typeNameLookup(names: ReadonlyMap<number, string>): (typeId: number) => string {
  return (typeId) => names.get(typeId) ?? `Type #${typeId}`;
}

/** Filter a journal, then memoize the result and the ref types its dropdown offers. */
export function useJournalFilterResult(
  journal: readonly WalletJournalEntry[],
  filter: WalletJournalFilter
): { filteredJournal: WalletJournalEntry[]; refTypeOptions: string[] } {
  const { t } = useTranslation();
  const filteredJournal = useMemo(
    () => filterWalletJournal(journal, filter, (entry) => journalDescriptionText(entry, t)),
    [journal, filter, t]
  );
  const refTypeOptions = useMemo(() => journalRefTypes(journal), [journal]);
  return { filteredJournal, refTypeOptions };
}

/**
 * One column set for both journals — ESI returns the same schema for each —
 * built per journal only because each links its lines to its own fills.
 */
export function useJournalColumnsBuilder(): (
  linkFor: (entry: WalletJournalEntry) => WalletTransactionCommon | undefined,
  nameFor: (typeId: number) => string
) => DataTableColumn<WalletJournalEntry>[] {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  return useCallback(
    (
      linkFor: (entry: WalletJournalEntry) => WalletTransactionCommon | undefined,
      nameFor: (typeId: number) => string
    ): DataTableColumn<WalletJournalEntry>[] => [
      {
        id: 'date',
        header: t('wallet.date'),
        className: 'whitespace-nowrap text-text-dim',
        render: (entry) => formatTimestamp(new Date(entry.date), timeZone),
        sortValue: (entry) => entry.date,
      },
      {
        id: 'refType',
        header: t('wallet.refType'),
        className: 'whitespace-nowrap',
        render: (entry) => humanizeRefType(entry.ref_type),
        sortValue: (entry) => humanizeRefType(entry.ref_type),
      },
      {
        id: 'description',
        header: t('wallet.description'),
        phoneHidden: true,
        render: (entry) => {
          const transaction = linkFor(entry);
          return (
            <JournalDescriptionCell
              entry={entry}
              transaction={transaction}
              itemName={transaction ? nameFor(transaction.type_id) : ''}
            />
          );
        },
        sortValue: (entry) => journalDescriptionText(entry, t),
      },
      {
        id: 'amount',
        header: t('wallet.amount'),
        align: 'right',
        className: 'tabular-nums',
        cellClassName: (entry) => (entry.amount !== undefined ? iskToneClass(entry.amount) : ''),
        render: (entry) =>
          entry.amount !== undefined ? formatIsk(entry.amount, 2) : t('common.unknown'),
        sortValue: (entry) => entry.amount,
      },
      {
        id: 'balance',
        header: t('wallet.balanceCol'),
        phoneHidden: true,
        align: 'right',
        className: 'tabular-nums text-text-dim',
        render: (entry) =>
          entry.balance !== undefined ? formatIsk(entry.balance, 2) : t('common.unknown'),
        sortValue: (entry) => entry.balance,
      },
    ],
    [t, timeZone]
  );
}
