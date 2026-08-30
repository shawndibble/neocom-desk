import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, DataAgeBadge, DataTable, EmptyState, Panel, Spinner, Tabs } from '@/components/ui';
import type { DataTableColumn } from '@/components/ui';
import { loadOrders, loadOrderHistory } from '@/features/character/orders';
import type { CachedResult } from '@/esi/cache';
import { loadTypeNames } from '@/features/character/typeNames';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { formatIsk } from '@/lib/isk';
import type { MarketOrder, MarketOrderHistory } from '@/esi/endpoints';

/** Stable identity, so the fallback doesn't invalidate the column memos every render. */
const NO_TYPE_NAMES: ReadonlyMap<number, string> = new Map();

interface Snapshot {
  ordersResult: CachedResult<MarketOrder[]> | null;
  historyResult: CachedResult<MarketOrderHistory[]> | null;
  typeNames: Map<number, string>;
}

async function loadOrdersSnapshot(
  characterId: number,
  signal: RouteSnapshotSignal
): Promise<Snapshot> {
  const [ordersResult, historyResult] = await Promise.all([
    loadOrders(characterId),
    loadOrderHistory(characterId),
  ]);
  const typeIds = new Set<number>();
  // Already superseded: skip the ESI name resolve, its result would be discarded.
  if (!signal.cancelled) {
    for (const o of ordersResult?.data ?? []) typeIds.add(o.type_id);
    for (const o of historyResult?.data ?? []) typeIds.add(o.type_id);
  }
  const typeNames = await loadTypeNames([...typeIds]);
  return { ordersResult, historyResult, typeNames };
}

/** Orders: open orders + history tabs. Read-only, cached for offline. */
export function Orders() {
  const { t } = useTranslation();
  const { data, loading, hydrated, activeCharacterId, refresh } =
    useRouteSnapshot(loadOrdersSnapshot);

  const [tab, setTab] = useState<'open' | 'history'>('open');

  const ordersResult = data?.ordersResult ?? null;
  const historyResult = data?.historyResult ?? null;
  const typeNames = data?.typeNames ?? NO_TYPE_NAMES;

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

  return (
    <div className="mx-auto max-w-3xl space-y-4">
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
      ) : tab === 'open' ? (
        <Panel
          padded={false}
          actions={ordersResult ? <DataAgeBadge date={ordersResult.fetchedAt} /> : undefined}
        >
          {!ordersResult || orders.length === 0 ? (
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
          actions={historyResult ? <DataAgeBadge date={historyResult.fetchedAt} /> : undefined}
        >
          {!historyResult || history.length === 0 ? (
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
