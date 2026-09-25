import { useCallback, useMemo, type ReactElement } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  DataAgeBadge,
  DataTable,
  EmptyState,
  IconButton,
  Panel,
  Spinner,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { loadWalletTransactions } from '@/features/character/wallet';
import { ItemContextMenu } from './ItemContextMenu';
import { TransactionsDayList } from './TransactionsDayList';
import { TransactionsSummaryStrip } from './TransactionsSummaryStrip';
import { TransactionsFilterBar } from '@/features/corp/CorpTransactionsPanel';
import {
  EMPTY_TRANSACTION_FILTER_PARAMS,
  filterWalletTransactions,
  TRANSACTION_FIELD_TO_PARAM,
  TRANSACTION_FILTER_PARAMS,
  type WalletTransactionFilter,
} from '@/features/character/walletTransactionFilter';
import { useUrlFilter } from '@/lib/useUrlState';
import { useIsPhone } from '@/lib/useIsPhone';
import { MarketItemLink } from './MarketItemLink';
import type { CachedResult } from '@/esi/cache';
import { loadTypeNames } from '@/features/character/typeNames';
import { iskToneClass } from '@/features/character/format';
import type { BlueprintCatalog } from '@/features/industry/blueprintCatalog';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { formatIsk } from '@/lib/isk';
import { formatTimestamp } from '@/lib/timestamp';
import { useTimeZone } from '@/lib/timeFormat';
import { downloadCsv } from '@/lib/downloadCsv';
import {
  transactionTotal,
  walletTransactionsCsvColumns,
} from '@/features/character/walletTransactionsCsv';
import type { WalletTransaction } from '@/esi/endpoints';
import { HistoryViewSelect, type HistoryView } from './HistoryViewSelect';
import { useHighlightParam } from '@/lib/useHighlightParam';
import { highlightedTransactionId } from './transactionHighlight';

/** Stable identity, so the fallback doesn't invalidate the column memo every render. */
const NO_TYPE_NAMES: ReadonlyMap<number, string> = new Map();

interface Snapshot {
  transactionsResult: CachedResult<WalletTransaction[]> | null;
  /** The fetch stopped at the transactions page cap; older history is missing. */
  transactionsTruncated: boolean;
  typeNames: Map<number, string>;
}

async function loadTransactionsSnapshot(
  characterId: number,
  signal: RouteSnapshotSignal
): Promise<Snapshot> {
  const transactionsResult = await loadWalletTransactions(characterId);
  const transactionsTruncated = transactionsResult?.truncated ?? false;
  // Already superseded: skip the ESI name resolve, its result would be discarded.
  const typeIds = signal.cancelled
    ? []
    : [...new Set((transactionsResult?.data ?? []).map((txn) => txn.type_id))];
  const typeNames = await loadTypeNames(typeIds);
  return { transactionsResult, transactionsTruncated, typeNames };
}

/**
 * Market's Transactions tab: a character's recent buy/sell fills. Personal
 * only, and now for a reason of its own rather than for want of an endpoint:
 * the corporation's fills live on the corp side of `/wallet`, beside the corp
 * journal they reconcile against (issue #570). Desktop carries the same
 * search / side / date filter bar as that panel, plus the Sold / Bought / Net
 * strip over the rows left (issue #1738); the phone day list keeps its own
 * strip and no filter bar.
 */
interface TransactionsPanelProps {
  /** Switches the History tab to its other view; the picker lives in this panel's header. */
  onViewChange: (view: HistoryView) => void;
  /** Same per-item context menu as Appraisal: null until requested, then per-typeId lookups. */
  blueprintCatalog: BlueprintCatalog | null;
  onRequestBlueprintCatalog: () => void;
  onAddToQuickbar: (typeId: number, itemName: string) => void;
  quickbarAvailable: boolean;
  onShowInfo: (typeId: number, itemName: string) => void;
}

export function TransactionsPanel({
  onViewChange,
  blueprintCatalog,
  onRequestBlueprintCatalog,
  onAddToQuickbar,
  quickbarAvailable,
  onShowInfo,
}: TransactionsPanelProps) {
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

  // One filter bar on this tab, so the scope key never changes and the
  // filter never needs `useUrlFilter`'s scope-reset.
  const [filter, setFilter] = useUrlFilter<WalletTransactionFilter>(
    'transactions',
    TRANSACTION_FILTER_PARAMS,
    TRANSACTION_FIELD_TO_PARAM,
    EMPTY_TRANSACTION_FILTER_PARAMS
  );
  const filteredTransactions = useMemo(
    () => filterWalletTransactions(transactions, filter, nameFor),
    [transactions, filter, nameFor]
  );
  // The phone has no filter bar, so it lists and exports everything.
  const exportedTransactions = isPhone ? transactions : filteredTransactions;

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
        /** Titles the card on a phone — the item is what the transaction is. */
        primary: true,
        render: (txn) => (
          <MarketItemLink typeId={txn.type_id}>
            {typeNames.get(txn.type_id) ?? `Type #${txn.type_id}`}
          </MarketItemLink>
        ),
        sortValue: (txn) => nameFor(txn.type_id),
      },
      {
        id: 'side',
        header: t('wallet.side'),
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
        render: (txn) => formatIsk(txn.unit_price, 2),
        sortValue: (txn) => txn.unit_price,
      },
      {
        id: 'total',
        header: t('wallet.total'),
        align: 'right',
        className: 'tabular-nums',
        cellClassName: (txn) => iskToneClass(transactionTotal(txn)),
        render: (txn) => formatIsk(transactionTotal(txn), 2),
        sortValue: (txn) => transactionTotal(txn),
      },
    ],
    [t, typeNames, timeZone, nameFor]
  );

  /** Same menu the Appraisal ledger carries — a transaction row names an item like any other. */
  function rowContextMenu(txn: WalletTransaction, tr: ReactElement) {
    const itemName = typeNames.get(txn.type_id) ?? `Type #${txn.type_id}`;
    const blueprintTypeID =
      blueprintCatalog === null
        ? undefined
        : (blueprintCatalog.byProductTypeID.get(txn.type_id)?.blueprintTypeID ?? null);
    return (
      <ItemContextMenu
        typeId={txn.type_id}
        itemName={itemName}
        blueprintTypeID={blueprintTypeID}
        onAddToQuickbar={onAddToQuickbar}
        quickbarAvailable={quickbarAvailable}
        onShowInfo={onShowInfo}
        onOpenChange={(open) => {
          if (open) onRequestBlueprintCatalog();
        }}
      >
        {tr}
      </ItemContextMenu>
    );
  }

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
                <IconButton
                  size={isPhone ? 'md' : 'sm'}
                  icon={<Icon.Download />}
                  label={t('wallet.exportCsvTransactions')}
                  disabled={exportedTransactions.length === 0}
                  onClick={() =>
                    downloadCsv(
                      'wallet-transactions',
                      exportedTransactions,
                      walletTransactionsCsvColumns(t, (id) => typeNames.get(id) ?? `Type #${id}`),
                      new Date(),
                      transactionsTruncated
                    )
                  }
                />
                <DataAgeBadge date={transactionsResult.fetchedAt} />
              </>
            )}
          </span>
        </span>
      }
    >
      {!transactionsResult || transactions.length === 0 ? (
        <EmptyState
          title={t('wallet.transactionsEmptyTitle')}
          hint={t('wallet.transactionsEmptyHint')}
          className="py-8"
        />
      ) : (
        <>
          {transactionsResult.fromCache && (
            <p className="px-3 pt-2 text-[0.6875rem] text-warning uppercase">
              {t(offlineTitleKey)}
            </p>
          )}
          {isPhone ? (
            <TransactionsDayList
              transactions={transactions}
              nameFor={nameFor}
              label={t('wallet.transactionsTab')}
              highlightId={highlightId}
              rowContextMenu={rowContextMenu}
            />
          ) : (
            <>
              <TransactionsFilterBar filter={filter} onChange={setFilter} />
              {filteredTransactions.length === 0 ? (
                <EmptyState
                  title={t('wallet.transactionsNoFilterMatches')}
                  hint={t('wallet.transactionsNoFilterMatchesHint')}
                  className="py-8"
                />
              ) : (
                <>
                  <TransactionsSummaryStrip transactions={filteredTransactions} className="mb-3" />
                  <DataTable
                    label={t('wallet.transactionsTab')}
                    columns={columns}
                    rows={filteredTransactions}
                    rowKey={(txn) => txn.transaction_id}
                    highlightRowKey={highlightId}
                    rowContextMenu={rowContextMenu}
                    rowMoreActions
                    // `transactions` already arrives newest-first (the `sort` above) —
                    // matches that so a header click is the first thing that reorders it.
                    defaultSort={{ columnId: 'date', direction: 'desc' }}
                  />
                </>
              )}
            </>
          )}
        </>
      )}
    </Panel>
  );
}
