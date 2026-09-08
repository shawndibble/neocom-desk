import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
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
import { MarketItemLink } from './MarketItemLink';
import type { CachedResult } from '@/esi/cache';
import { loadTypeNames } from '@/features/character/typeNames';
import { iskToneClass } from '@/features/character/format';
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
import { HIGHLIGHT_PARAM } from '@/features/notifications/notificationOptions';
import { highlightedTransactionId, parseHighlightTypeId } from './transactionHighlight';

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
 * journal they reconcile against (issue #570). This panel has no filter bar
 * and that one does — matching them up is a separate call.
 */
interface TransactionsPanelProps {
  /** Switches the History tab to its other view; the picker lives in this panel's header. */
  onViewChange: (view: HistoryView) => void;
}

export function TransactionsPanel({ onViewChange }: TransactionsPanelProps) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const { data, error, loading, hydrated, activeCharacterId, refreshCount, refresh } =
    useRouteSnapshot(loadTransactionsSnapshot, undefined, { cacheKey: 'market:transactions' });
  const [searchParams, setSearchParams] = useSearchParams();
  /**
   * The item a "sell order filled" alert sent the reader here to look at.
   *
   * Latched into state on mount rather than read from the URL each render, and
   * the param is dropped as soon as it is: a pilot who leaves for the Order
   * History tab and comes back should not be pulsed at a second time, and a
   * reload should not either. What they were shown once, they were shown.
   */
  const [highlightTypeId] = useState(() => parseHighlightTypeId(searchParams.get(HIGHLIGHT_PARAM)));

  // A manual Refresh that still falls back to cache is a more alarming case
  // than the initial load finding cache first — same banner, different copy.
  const offlineTitleKey = refreshCount > 0 ? 'common.refreshFailedTitle' : 'common.offlineTitle';

  const transactionsResult = data?.transactionsResult ?? null;
  const transactionsTruncated = data?.transactionsTruncated ?? false;
  const typeNames = data?.typeNames ?? NO_TYPE_NAMES;

  const transactions = useMemo(
    () => [...(transactionsResult?.data ?? [])].sort((a, b) => b.date.localeCompare(a.date)),
    [transactionsResult]
  );

  const highlightId = useMemo(
    () => highlightedTransactionId(transactions, highlightTypeId),
    [transactions, highlightTypeId]
  );

  const tableRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (highlightTypeId === null) return;
    // Spend the param even when nothing matched: the fill can be newer than
    // the cached transactions, or older than the page cap, and a link that
    // stays armed would pulse a *different* row once the cache catches up.
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.delete(HIGHLIGHT_PARAM);
        return params;
      },
      { replace: true }
    );
  }, [highlightTypeId, setSearchParams]);

  useEffect(() => {
    if (highlightId === null) return;
    const row = tableRef.current?.querySelector(`[data-row-key="${highlightId}"]`);
    if (!row) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    row.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
  }, [highlightId]);

  const columns = useMemo<DataTableColumn<WalletTransaction>[]>(
    () => [
      {
        id: 'date',
        header: t('wallet.date'),
        className: 'whitespace-nowrap text-text-dim',
        render: (txn) => formatTimestamp(new Date(txn.date), timeZone),
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
      },
      {
        id: 'side',
        header: t('wallet.side'),
        render: (txn) => (txn.is_buy ? t('wallet.buy') : t('wallet.sell')),
      },
      {
        id: 'quantity',
        header: t('wallet.quantity'),
        align: 'right',
        className: 'tabular-nums',
        render: (txn) => txn.quantity.toLocaleString(),
      },
      {
        id: 'unitPrice',
        header: t('wallet.unitPrice'),
        align: 'right',
        className: 'tabular-nums',
        render: (txn) => formatIsk(txn.unit_price, 2),
      },
      {
        id: 'total',
        header: t('wallet.total'),
        align: 'right',
        className: 'tabular-nums',
        cellClassName: (txn) => iskToneClass(transactionTotal(txn)),
        render: (txn) => formatIsk(transactionTotal(txn), 2),
      },
    ],
    [t, typeNames, timeZone]
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
      actions={
        <span className="flex w-full items-center justify-between gap-2">
          <HistoryViewSelect value="transactions" onChange={onViewChange} />
          <span className="flex items-center gap-2">
            <IconButton
              size="sm"
              icon={<Icon.Refresh />}
              label={t('wallet.refresh')}
              onClick={refresh}
            />
            {transactionsResult && (
              <>
                <IconButton
                  size="sm"
                  icon={<Icon.Download />}
                  label={t('wallet.exportCsvTransactions')}
                  disabled={transactions.length === 0}
                  onClick={() =>
                    downloadCsv(
                      'wallet-transactions',
                      transactions,
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
          <div ref={tableRef}>
            <DataTable
              label={t('wallet.transactionsTab')}
              columns={columns}
              rows={transactions}
              rowKey={(txn) => txn.transaction_id}
              rowClassName={(txn) => (txn.transaction_id === highlightId ? 'row-pulse' : undefined)}
            />
          </div>
        </>
      )}
    </Panel>
  );
}
