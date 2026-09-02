import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataAgeBadge,
  DataTable,
  EmptyState,
  Panel,
  ReauthBanner,
  Spinner,
  Tabs,
} from '@/components/ui';
import type { DataTableColumn } from '@/components/ui';
import { beginEveLogin } from '@/app/loginFlow';
import { loadOrders, loadOrderHistory } from '@/features/character/orders';
import type { CachedResult } from '@/esi/cache';
import { loadTypeNames } from '@/features/character/typeNames';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { formatIsk } from '@/lib/isk';
import { downloadCsv } from '@/lib/downloadCsv';
import { ordersCsvColumns, orderHistoryCsvColumns } from '@/features/character/ordersCsv';
import type { MarketOrder, MarketOrderHistory } from '@/esi/endpoints';

/** Stable identity, so the fallback doesn't invalidate the column memos every render. */
const NO_TYPE_NAMES: ReadonlyMap<number, string> = new Map();

interface Snapshot {
  ordersResult: CachedResult<MarketOrder[]> | null;
  historyResult: CachedResult<MarketOrderHistory[]> | null;
  /** 401/403 (or a failed token refresh) means "log in again", not "offline". */
  ordersNeedsReauth: boolean;
  historyNeedsReauth: boolean;
  /** Fewer pages came back than ESI advertised — the history list below is partial. */
  historyTruncated: boolean;
  typeNames: Map<number, string>;
}

async function loadOrdersSnapshot(
  characterId: number,
  signal: RouteSnapshotSignal
): Promise<Snapshot> {
  const [ordersStatus, historyStatus] = await Promise.all([
    loadOrders(characterId),
    loadOrderHistory(characterId),
  ]);
  const { cached: ordersResult, needsReauth: ordersNeedsReauth } = ordersStatus;
  const { cached: historyResult, needsReauth: historyNeedsReauth } = historyStatus;
  const historyTruncated = historyResult?.truncated ?? false;
  const typeIds = new Set<number>();
  // Already superseded: skip the ESI name resolve, its result would be discarded.
  if (!signal.cancelled) {
    for (const o of ordersResult?.data ?? []) typeIds.add(o.type_id);
    for (const o of historyResult?.data ?? []) typeIds.add(o.type_id);
  }
  const typeNames = await loadTypeNames([...typeIds]);
  return {
    ordersResult,
    historyResult,
    ordersNeedsReauth,
    historyNeedsReauth,
    historyTruncated,
    typeNames,
  };
}

/** Orders: open orders + history tabs. Read-only, cached for offline. */
export function Orders() {
  const { t } = useTranslation();
  const { data, error, loading, hydrated, activeCharacterId, refresh } =
    useRouteSnapshot(loadOrdersSnapshot);

  const [tab, setTab] = useState<'open' | 'history'>('open');

  const ordersResult = data?.ordersResult ?? null;
  const historyResult = data?.historyResult ?? null;
  const ordersNeedsReauth = data?.ordersNeedsReauth ?? false;
  const historyNeedsReauth = data?.historyNeedsReauth ?? false;
  const historyTruncated = data?.historyTruncated ?? false;
  const typeNames = data?.typeNames ?? NO_TYPE_NAMES;
  const nameFor = (typeId: number) => typeNames.get(typeId) ?? `Type #${typeId}`;

  const orders = useMemo(
    () => [...(ordersResult?.data ?? [])].sort((a, b) => b.issued.localeCompare(a.issued)),
    [ordersResult]
  );
  const history = useMemo(
    () => [...(historyResult?.data ?? [])].sort((a, b) => b.issued.localeCompare(a.issued)),
    [historyResult]
  );

  const baseColumns = useMemo<DataTableColumn<MarketOrder>[]>(
    () => [
      {
        id: 'item',
        header: t('orders.item'),
        render: (order) => typeNames.get(order.type_id),
      },
      {
        id: 'side',
        header: t('orders.side'),
        render: (order) => (order.is_buy_order ? t('orders.buy') : t('orders.sell')),
      },
      {
        id: 'price',
        header: t('orders.price'),
        align: 'right',
        className: 'tabular-nums',
        render: (order) => formatIsk(order.price, 2),
      },
      {
        id: 'remaining',
        header: t('orders.remaining'),
        align: 'right',
        className: 'tabular-nums',
        render: (order) =>
          `${order.volume_remain.toLocaleString()} / ${order.volume_total.toLocaleString()}`,
      },
      {
        id: 'issued',
        header: t('orders.issued'),
        className: 'whitespace-nowrap text-text-dim',
        render: (order) => new Date(order.issued).toLocaleDateString(),
      },
    ],
    [t, typeNames]
  );
  const historyColumns = useMemo<DataTableColumn<MarketOrderHistory>[]>(
    () => [
      ...baseColumns,
      {
        id: 'state',
        header: t('orders.state'),
        className: 'text-text-dim',
        render: (order) => order.state,
      },
    ],
    [baseColumns, t]
  );

  if (!hydrated) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  // Both tabs read the same scope (esi-markets.read_character_orders.v1), so
  // the same banner covers either panel losing it.
  const reauthBanner = (
    <div className="px-3 py-2">
      <ReauthBanner
        title={t('orders.reauthTitle')}
        hint={t('orders.reauthHint')}
        actionLabel={t('orders.reauthAction')}
        onLogin={() => void beginEveLogin()}
      />
    </div>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-widest uppercase">{t('orders.title')}</h1>
        <Button size="sm" onClick={refresh} disabled={loading}>
          {t('orders.refresh')}
        </Button>
      </header>

      <Tabs
        label={t('orders.title')}
        value={tab}
        onChange={(id) => setTab(id as typeof tab)}
        tabs={[
          { id: 'open', label: t('orders.openTab') },
          { id: 'history', label: t('orders.historyTab') },
        ]}
      />

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner label={t('common.loading')} />
        </div>
      ) : error ? (
        <EmptyState title={t('common.loadFailedTitle')} hint={t('common.loadFailedHint')} />
      ) : tab === 'open' ? (
        <Panel
          padded={false}
          actions={
            ordersResult ? (
              <span className="flex items-center gap-2">
                <Button
                  size="sm"
                  disabled={orders.length === 0}
                  onClick={() => downloadCsv('orders-open', orders, ordersCsvColumns(t, nameFor))}
                >
                  {t('orders.exportCsvOpen')}
                </Button>
                <DataAgeBadge date={ordersResult.fetchedAt} />
              </span>
            ) : undefined
          }
        >
          {ordersNeedsReauth ? (
            reauthBanner
          ) : !ordersResult || orders.length === 0 ? (
            <EmptyState
              title={t('orders.emptyTitle')}
              hint={t('orders.emptyHint')}
              className="py-8"
            />
          ) : (
            <>
              {ordersResult.fromCache && (
                <p className="px-3 pt-2 text-[0.6875rem] text-warning uppercase">
                  {t('common.offlineTitle')}
                </p>
              )}
              <DataTable
                columns={baseColumns}
                rows={orders}
                rowKey={(order) => order.order_id}
                label={t('orders.openTab')}
              />
            </>
          )}
        </Panel>
      ) : (
        <Panel
          padded={false}
          actions={
            historyResult ? (
              <span className="flex items-center gap-2">
                <Button
                  size="sm"
                  disabled={history.length === 0}
                  onClick={() =>
                    downloadCsv(
                      'orders-history',
                      history,
                      orderHistoryCsvColumns(t, nameFor),
                      new Date(),
                      historyTruncated
                    )
                  }
                >
                  {t('orders.exportCsvHistory')}
                </Button>
                <DataAgeBadge date={historyResult.fetchedAt} />
              </span>
            ) : undefined
          }
        >
          {historyNeedsReauth ? (
            reauthBanner
          ) : !historyResult || history.length === 0 ? (
            <EmptyState
              title={t('orders.historyEmptyTitle')}
              hint={t('orders.historyEmptyHint')}
              className="py-8"
            />
          ) : (
            <>
              {historyResult.fromCache && (
                <p className="px-3 pt-2 text-[0.6875rem] text-warning uppercase">
                  {t('common.offlineTitle')}
                </p>
              )}
              {historyTruncated && (
                <p className="px-3 pt-2 text-[0.6875rem] text-warning uppercase">
                  {t('common.incompleteTitle')}
                </p>
              )}
              <DataTable
                columns={historyColumns}
                rows={history}
                rowKey={(order) => order.order_id}
                label={t('orders.historyTab')}
              />
            </>
          )}
        </Panel>
      )}
    </div>
  );
}
