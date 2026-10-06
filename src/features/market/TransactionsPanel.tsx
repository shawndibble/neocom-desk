import { useCallback, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataAgeBadge,
  DataTable,
  CachedEmptyState,
  EmptyState,
  IconButton,
  Panel,
  Spinner,
  Tooltip,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { GrantBanner } from '@/app/GrantNote';
import { loadWalletJournal, loadWalletTransactionsWithStatus } from '@/features/character/wallet';
import { TransactionsSummaryStrip } from './TransactionsSummaryStrip';
import { TransactionsFilterBar } from '@/features/corp/CorpTransactionsPanel';
import {
  EMPTY_TRANSACTION_FILTER_PARAMS,
  EMPTY_WALLET_TRANSACTION_FILTER,
  filterWalletTransactions,
  TRANSACTION_FIELD_TO_PARAM,
  TRANSACTION_FILTER_PARAMS,
  type WalletTransactionFilter,
} from '@/features/character/walletTransactionFilter';
import { useUrlFilter } from '@/lib/useUrlState';
import { useIsPhone } from '@/lib/useIsPhone';
import { ItemInfoLink } from '@/features/entities';
import type { CachedResult } from '@/esi/cache';
import { loadTypeNames } from '@/features/character/typeNames';
import { iskToneClass } from '@/features/character/format';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { formatMarketIsk } from '@/lib/isk';
import { formatTimestamp } from '@/lib/timestamp';
import { useTimeZone } from '@/lib/timeFormat';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import {
  transactionTotal,
  walletTransactionsCsvColumns,
} from '@/features/character/walletTransactionsCsv';
import type { WalletJournalEntry, WalletTransaction } from '@/esi/endpoints';
import { transactionMargins } from './transactionMargins';
import { HistoryViewSelect, type HistoryView } from './HistoryViewSelect';
import { useHighlightParam } from '@/lib/useHighlightParam';
import { highlightedTransactionId } from './transactionHighlight';

/** Stable identity, so the fallback doesn't invalidate the column memo every render. */
const NO_TYPE_NAMES: ReadonlyMap<number, string> = new Map();
const NO_JOURNAL: readonly WalletJournalEntry[] = [];

interface Snapshot {
  transactionsResult: CachedResult<WalletTransaction[]> | null;
  /** 401/403 (or a failed token refresh) means "grant the Wallet Permission", not "offline". */
  transactionsNeedsReauth: boolean;
  /** The fetch stopped at the transactions page cap; older history is missing. */
  transactionsTruncated: boolean;
  typeNames: Map<number, string>;
  /** Only for the Margin column's sales tax lines; null when it couldn't be read. */
  journal: WalletJournalEntry[] | null;
}

async function loadTransactionsSnapshot(
  characterId: number,
  signal: RouteSnapshotSignal
): Promise<Snapshot> {
  // A journal that fails to load only blanks the Margin column, never the tab.
  const [{ cached: transactionsResult, needsReauth: transactionsNeedsReauth }, journalResult] =
    await Promise.all([
      loadWalletTransactionsWithStatus(characterId),
      loadWalletJournal(characterId).catch(() => null),
    ]);
  const transactionsTruncated = transactionsResult?.truncated ?? false;
  // Already superseded: skip the ESI name resolve, its result would be discarded.
  const typeIds = signal.cancelled
    ? []
    : [...new Set((transactionsResult?.data ?? []).map((txn) => txn.type_id))];
  const typeNames = await loadTypeNames(typeIds);
  return {
    transactionsResult,
    transactionsNeedsReauth,
    transactionsTruncated,
    typeNames,
    journal: journalResult?.data ?? null,
  };
}

/**
 * Market's Transactions tab: a character's recent buy/sell fills. Personal
 * only, and now for a reason of its own rather than for want of an endpoint:
 * the corporation's fills live on the corp side of `/wallet`, beside the corp
 * journal they reconcile against (issue #570). Desktop carries the same
 * search / side / date filter bar as that panel, plus the Sold / Bought / Net
 * strip over the rows left (issue #1738), and a Margin column priced from
 * the character's own wallet buys (issue #1740); the phone day list keeps its
 * own strip and no filter bar or margin.
 */
interface TransactionsPanelProps {
  /** Switches the History tab to its other view; the picker lives in this panel's header. */
  onViewChange: (view: HistoryView) => void;
}

/** Module-level so the table's windowing and row memo see one stable function. */
const transactionRowKey = (txn: WalletTransaction) => txn.transaction_id;

export function TransactionsPanel({ onViewChange }: TransactionsPanelProps) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const timeZone = useTimeZone();
  const { data, error, loading, hydrated, activeCharacterId, refreshCount, refresh } =
    useRouteSnapshot(loadTransactionsSnapshot, undefined, { cacheKey: 'market:transactions' });
  const highlightTypeId = useHighlightParam();
  // A manual Refresh that still falls back to cache is a more alarming case
  // than the initial load finding cache first — same banner, different copy.
  const offlineTitleKey = refreshCount > 0 ? 'common.refreshFailedTitle' : 'common.offlineTitle';

  const transactionsResult = data?.transactionsResult ?? null;
  const transactionsNeedsReauth = data?.transactionsNeedsReauth ?? false;
  const transactionsTruncated = data?.transactionsTruncated ?? false;
  const typeNames = data?.typeNames ?? NO_TYPE_NAMES;
  const nameFor = useCallback(
    (typeId: number) => typeNames.get(typeId) ?? `Type #${typeId}`,
    [typeNames]
  );

  const transactions = useMemo(
    () => [...(transactionsResult?.data ?? [])].sort((a, b) => b.date.localeCompare(a.date)),
    [transactionsResult]
  );
  const journal = data?.journal ?? NO_JOURNAL;
  // Worked out over every fill, not the filtered rows — a filter must not change what a sale cost.
  const margins = useMemo(() => transactionMargins(transactions, journal), [transactions, journal]);

  // One filter bar on this tab, so the scope key never changes and the
  // filter never needs `useUrlFilter`'s scope-reset.
  const [filter, setFilter, rowsFilter] = useUrlFilter<WalletTransactionFilter>(
    'transactions',
    TRANSACTION_FILTER_PARAMS,
    TRANSACTION_FIELD_TO_PARAM,
    EMPTY_TRANSACTION_FILTER_PARAMS
  );
  const filteredTransactions = useMemo(
    () => filterWalletTransactions(transactions, rowsFilter, nameFor),
    [transactions, rowsFilter, nameFor]
  );
  const csvColumns = useMemo(() => walletTransactionsCsvColumns(t, nameFor), [t, nameFor]);
  const transactionsExport = useTableExport({
    surface: 'wallet-transactions',
    rows: filteredTransactions,
    columns: csvColumns,
    truncated: transactionsTruncated,
  });

  /**
   * The alert names the *item*; the table is keyed by transaction. Resolving
   * one to the other is this panel's job because only it knows that rule —
   * the newest sell of that item (`transactionHighlight.ts`).
   */
  const highlightId = useMemo(
    () => highlightedTransactionId(transactions, highlightTypeId),
    [transactions, highlightTypeId]
  );

  const columns = useMemo<DataTableColumn<WalletTransaction>[]>(
    () => [
      {
        id: 'date',
        header: t('wallet.date'),
        className: 'whitespace-nowrap text-text-dim',
        render: (txn) => formatTimestamp(new Date(txn.date), timeZone),
        sortValue: (txn) => txn.date,
      },
      {
        id: 'item',
        header: t('wallet.item'),
        stickyStart: true,
        render: (txn) => (
          <ItemInfoLink typeId={txn.type_id}>
            {typeNames.get(txn.type_id) ?? `Type #${txn.type_id}`}
          </ItemInfoLink>
        ),
        sortValue: (txn) => nameFor(txn.type_id),
      },
      {
        id: 'side',
        header: t('wallet.side'),
        // The Total's sign and tone already say buy or sell.
        phoneHidden: true,
        render: (txn) => (txn.is_buy ? t('wallet.buy') : t('wallet.sell')),
        sortValue: (txn) => (txn.is_buy ? 0 : 1),
      },
      {
        id: 'quantity',
        header: t('wallet.quantity'),
        align: 'right',
        className: 'tabular-nums',
        render: (txn) => txn.quantity.toLocaleString(),
        sortValue: (txn) => txn.quantity,
      },
      {
        id: 'unitPrice',
        header: t('wallet.unitPrice'),
        align: 'right',
        className: 'tabular-nums',
        render: (txn) => formatMarketIsk(txn.unit_price),
        sortValue: (txn) => txn.unit_price,
      },
      {
        id: 'total',
        header: t('wallet.total'),
        align: 'right',
        className: 'tabular-nums',
        cellClassName: (txn) => iskToneClass(transactionTotal(txn)),
        render: (txn) => formatMarketIsk(transactionTotal(txn)),
        sortValue: (txn) => transactionTotal(txn),
      },
      {
        id: 'margin',
        header: t('wallet.margin'),
        phoneHidden: true,
        headerTooltip: t('wallet.marginTooltip'),
        align: 'right',
        className: 'tabular-nums',
        cellClassName: (txn) => {
          const margin = margins.get(txn.transaction_id);
          return margin ? iskToneClass(margin.margin) : 'text-text-dim';
        },
        render: (txn) => {
          if (txn.is_buy) return null;
          const margin = margins.get(txn.transaction_id);
          if (!margin) return '—';
          return (
            <Tooltip
              content={t('wallet.marginWorking', {
                unitCost: formatMarketIsk(margin.unitCost),
                salesTax: formatMarketIsk(margin.salesTax),
              })}
            >
              <span>{formatMarketIsk(margin.margin)}</span>
            </Tooltip>
          );
        },
        sortValue: (txn) => margins.get(txn.transaction_id)?.margin,
      },
    ],
    [t, typeNames, timeZone, nameFor, margins]
  );

  if (!hydrated) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  if (loading && !data) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (error) {
    return <EmptyState title={t('common.loadFailedTitle')} hint={t('common.loadFailedHint')} />;
  }

  return (
    <Panel
      padded={false}
      actionsFill={isPhone}
      actions={
        <span className="flex w-full items-center justify-between gap-2">
          <HistoryViewSelect value="transactions" onChange={onViewChange} />
          <span className="flex items-center gap-2">
            <IconButton
              size={isPhone ? 'md' : 'sm'}
              icon={<Icon.Refresh />}
              label={t('wallet.refresh')}
              onClick={refresh}
            />
            {transactionsResult && (
              <>
                <TableActionsMenu
                  name={t('market.sections.transactions')}
                  tableExport={transactionsExport}
                  size={isPhone ? 'md' : 'sm'}
                />
                <DataAgeBadge date={transactionsResult.fetchedAt} />
              </>
            )}
          </span>
        </span>
      }
    >
      {transactionsNeedsReauth ? (
        <div className="px-3 py-2">
          <GrantBanner
            characterId={activeCharacterId}
            endpoints={['getCharacterWalletTransactions']}
            title={t('wallet.transactionsReauthTitle')}
            hint={t('wallet.transactionsReauthHint')}
            actionLabel={t('wallet.reauthAction')}
          />
        </div>
      ) : !transactionsResult || transactions.length === 0 ? (
        <CachedEmptyState
          result={transactionsResult}
          title={t('wallet.transactionsEmptyTitle')}
          hint={t('wallet.transactionsEmptyHint')}
          fetchedTitle={t('wallet.transactionsEmptyFetchedTitle')}
          className="py-8"
        />
      ) : (
        <>
          {transactionsResult.fromCache && (
            <p className="px-3 pt-2 text-[0.6875rem] text-warning uppercase">
              {t(offlineTitleKey)}
            </p>
          )}
          {transactionsTruncated && (
            <p className="px-3 pt-2 text-[0.6875rem] text-warning uppercase">
              {t('common.incompleteTitle')} — {t('wallet.transactionsTruncatedHint')}
            </p>
          )}
          <>
            <TransactionsFilterBar filter={filter} onChange={setFilter} />
            {filteredTransactions.length === 0 ? (
              <EmptyState
                title={t('wallet.transactionsNoFilterMatches')}
                hint={t('wallet.transactionsNoFilterMatchesHint')}
                className="py-8"
                action={
                  <Button size="sm" onClick={() => setFilter(EMPTY_WALLET_TRANSACTION_FILTER)}>
                    {t('common.resetFilters')}
                  </Button>
                }
              />
            ) : (
              <>
                <TransactionsSummaryStrip transactions={filteredTransactions} className="mb-3" />
                <div className="overflow-x-auto">
                  <DataTable
                    {...transactionsExport.tableProps}
                    label={t('wallet.transactionsTab')}
                    columns={columns}
                    rows={filteredTransactions}
                    rowKey={transactionRowKey}
                    highlightRowKey={highlightId}
                    virtualize="auto"
                    responsive="table"
                    // `transactions` already arrives newest-first (the `sort` above) —
                    // matches that so a header click is the first thing that reorders it.
                    defaultSort={{ columnId: 'date', direction: 'desc' }}
                  />
                </div>
              </>
            )}
          </>
        </>
      )}
    </Panel>
  );
}
