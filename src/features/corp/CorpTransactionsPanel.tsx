/**
 * The corp wallet's Transactions view (issue #570).
 *
 * The corp journal could say that 4.2b left the SRP division and not what it
 * bought: the journal names a market escrow, the fills are a separate ESI
 * read, and only the character's were registered. This panel is the other
 * half of that reconciliation, one division at a time like everything else on
 * `/corp/wallet`.
 *
 * It owns no fetching and no filter state — the route holds both, so a
 * division switch resets the filter in the same place it resets the journal's
 * (see `routes/CorpWallet.tsx`).
 *
 * The filter bar and the six columns are the personal panel's too
 * (`TransactionsFilterBar` and `walletTransactionBaseColumns`, in
 * `features/character`): both wallets filter and read the same way. Only the
 * row menu's "Filter to this item" is the corp panel's own.
 */
import { useCallback, useMemo, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  ColumnPickerMenu,
  MenuItem,
  DataAgeBadge,
  DataTable,
  EmptyState,
  Panel,
  Spinner,
  type DataTableColumn,
  type DataTableSort,
  CachedNotice,
  IncompleteNotice,
} from '@/components/ui';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import { ItemContextMenu } from '@/features/market/ItemContextMenu';
import {
  activeWalletTransactionFilters,
  EMPTY_WALLET_TRANSACTION_FILTER,
  type WalletTransactionFilter,
} from '@/features/character/walletTransactionFilter';
import { TransactionsFilterBar } from '@/features/character/TransactionsFilterBar';
import { walletTransactionsCsvColumns } from '@/features/character/walletTransactionsCsv';
import { walletTransactionBaseColumns } from '@/features/character/walletTransactionColumns';
import { useIsPhone } from '@/lib/useIsPhone';
import { useTimeZone } from '@/lib/timeFormat';

import type { CachedResult } from '@/esi/cache';
import type { CorporationWalletTransaction } from '@/esi/endpoints';
import { useColumnVisibility } from '@/lib/columnVisibility';
import {
  CORP_TRANSACTIONS_COLUMN_IDS,
  CORP_TRANSACTIONS_PHONE_OFF_BY_DEFAULT,
  useVisibleCorpTransactionsColumns,
  type CorpTransactionsColumnId,
} from './corpTransactionsColumns';

interface CorpTransactionsPanelProps {
  /** `null` means the read never came back and no cache stood in for it. */
  transactionsResult: CachedResult<CorporationWalletTransaction[]> | null;
  /** Everything this division has, before the filter. */
  transactions: readonly CorporationWalletTransaction[];
  /** Already filtered by the route, so the table and the CSV agree by construction. */
  filteredTransactions: readonly CorporationWalletTransaction[];
  loading: boolean;
  filter: WalletTransactionFilter;
  onFilterChange: (filter: WalletTransactionFilter) => void;
  sort: DataTableSort;
  onSortChange: (sort: DataTableSort) => void;
  /** The same spelling the table's item column draws, for the CSV and the search. */
  nameFor: (typeId: number) => string;
  /** Names the CSV file's division, when the division list has loaded. */
  divisionQualifier: string | undefined;
  refreshFailed: boolean;
}

/** Module-level so the table's windowing and row memo see one stable function. */
const corpTransactionRowKey = (txn: CorporationWalletTransaction) => txn.transaction_id;

export function CorpTransactionsPanel({
  transactionsResult,
  transactions,
  filteredTransactions,
  loading,
  filter,
  onFilterChange,
  sort,
  onSortChange,
  nameFor,
  divisionQualifier,
  refreshFailed,
}: CorpTransactionsPanelProps) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();

  const isPhone = useIsPhone();

  // The same six columns Market's character panel draws, built by the same
  // helper: the two tables answer the same question about different wallets,
  // and a manager reconciling one against the other should not have to find
  // the columns twice, or read their figures at two precisions.
  const columns = useMemo(
    () =>
      walletTransactionBaseColumns<CorporationWalletTransaction>({
        t,
        timeZone,
        isPhone,
        nameFor,
        stickyStartOnPanel: true,
      }),
    [t, nameFor, timeZone, isPhone]
  );

  const { visible, isVisible, toggle, reset } = useColumnVisibility(
    useVisibleCorpTransactionsColumns,
    CORP_TRANSACTIONS_COLUMN_IDS,
    CORP_TRANSACTIONS_PHONE_OFF_BY_DEFAULT
  );
  const columnsById = useMemo(
    () =>
      Object.fromEntries(columns.map((column) => [column.id, column])) as Record<
        CorpTransactionsColumnId,
        DataTableColumn<CorporationWalletTransaction>
      >,
    [columns]
  );
  // Filtered only at the table's input: the route validates `?txn.sort=`
  // against every id, so a sort on a hidden column survives until it returns.
  const shownColumns = useMemo(
    () =>
      columns.filter(
        (column) => column.id === 'item' || isVisible(column.id as CorpTransactionsColumnId)
      ),
    [columns, isVisible]
  );

  const rowContextMenu = useCallback(
    (txn: CorporationWalletTransaction, tr: ReactElement) => (
      <ItemContextMenu
        typeId={txn.type_id}
        itemName={nameFor(txn.type_id)}
        hideStockTarget
        linksKeepBrowserMenu
        extraItems={
          <MenuItem onSelect={() => onFilterChange({ ...filter, text: nameFor(txn.type_id) })}>
            {t('wallet.filterToItem')}
          </MenuItem>
        }
      >
        {tr}
      </ItemContextMenu>
    ),
    [nameFor, filter, onFilterChange, t]
  );

  const csvColumns = useMemo(() => walletTransactionsCsvColumns(t, nameFor), [t, nameFor]);
  const tableExport = useTableExport({
    surface: 'corp-wallet-transactions',
    rows: filteredTransactions,
    columns: csvColumns,
    truncated: transactionsResult?.truncated ?? false,
    qualifier: divisionQualifier,
  });

  return (
    <Panel
      padded={false}
      title={t('wallet.transactionsTab')}
      actions={
        transactionsResult ? (
          <span className="flex items-center gap-2">
            <TableActionsMenu name={t('wallet.transactionsTab')} tableExport={tableExport} />
            <DataAgeBadge
              date={transactionsResult.fetchedAt}
              expiresAt={transactionsResult.expiresAt}
            />
          </span>
        ) : undefined
      }
    >
      {loading ? (
        <Spinner block="panel" label={t('common.loading')} />
      ) : transactionsResult === null ? (
        // No cache and the read didn't come back — offline, or a 403 the role
        // gate swallowed, which corp views hide rather than lock.
        <EmptyState
          title={t('common.loadFailedTitle')}
          hint={t('common.loadFailedHint')}
          className="py-8"
        />
      ) : transactions.length === 0 ? (
        // "This division has never traded" — a different answer from "nothing
        // matches your filters" below, so the filter bar stays off screen here
        // rather than inviting the user to adjust a filter that isn't the
        // reason the table is empty.
        <EmptyState
          title={t('wallet.corpTransactionsEmptyTitle')}
          hint={t('wallet.corpTransactionsEmptyHint')}
          className="py-8"
        />
      ) : (
        <>
          {transactionsResult.fromCache && (
            <CachedNotice
              withBadge
              className="px-3 pt-2"
              fetchedAt={transactionsResult.fetchedAt}
              refreshFailed={refreshFailed}
            />
          )}
          {transactionsResult.truncated && (
            <IncompleteNotice className="px-3 pt-2" hint={t('wallet.transactionsTruncatedHint')} />
          )}
          <TransactionsFilterBar
            filter={filter}
            onChange={onFilterChange}
            resultCount={filteredTransactions.length}
            actions={
              <ColumnPickerMenu
                available={CORP_TRANSACTIONS_COLUMN_IDS}
                visible={visible}
                columnsById={columnsById}
                onToggle={toggle}
                onReset={reset}
                buttonLabel={t('common.columnsButton')}
                menuTitle={t('common.columnsMenuTitle')}
                resetLabel={t('common.resetColumns')}
              />
            }
          />
          {filteredTransactions.length === 0 ? (
            <EmptyState
              title={t('wallet.transactionsNoFilterMatches')}
              hint={t('wallet.transactionsNoFilterMatchesHint')}
              className="py-8"
              action={
                activeWalletTransactionFilters(filter, t).length > 0 ||
                filter.text.trim() !== '' ? (
                  <Button size="sm" onClick={() => onFilterChange(EMPTY_WALLET_TRANSACTION_FILTER)}>
                    {t('common.resetFilters')}
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <DataTable
                {...tableExport.tableProps}
                label={t('wallet.transactionsTab')}
                columns={shownColumns}
                rows={filteredTransactions}
                rowKey={corpTransactionRowKey}
                virtualize="auto"
                sort={sort}
                onSortChange={onSortChange}
                responsive="table"
                rowContextMenu={rowContextMenu}
                rowMoreActions
              />
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
