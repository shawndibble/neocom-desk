import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, DataAgeBadge, DataTable, EmptyState, Panel, Spinner, Tabs } from '@/components/ui';
import type { DataTableColumn } from '@/components/ui';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { loadOrders, loadOrderHistory } from '@/features/character/orders';
import type { CachedResult } from '@/esi/cache';
import { loadTypeNames } from '@/features/character/typeNames';
import { formatIsk } from '@/lib/isk';
import type { MarketOrder, MarketOrderHistory } from '@/esi/endpoints';

interface Snapshot {
  requestKey: string;
  ordersResult: CachedResult<MarketOrder[]> | null;
  historyResult: CachedResult<MarketOrderHistory[]> | null;
  typeNames: Map<number, string>;
}

/** Orders: open orders + history tabs. Read-only, cached for offline. */
export function Orders() {
  const { t } = useTranslation();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const hydrated = useActiveCharacter((state) => state.hydrated);

  const [tab, setTab] = useState<'open' | 'history'>('open');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const requestKey = `${activeCharacterId}:${refreshKey}`;

  useEffect(() => {
    if (activeCharacterId === null) return;
    let cancelled = false;
    void (async () => {
      const [ordersResult, historyResult] = await Promise.all([
        loadOrders(activeCharacterId),
        loadOrderHistory(activeCharacterId),
      ]);
      if (cancelled) return;
      const typeIds = new Set<number>();
      for (const o of ordersResult?.data ?? []) typeIds.add(o.type_id);
      for (const o of historyResult?.data ?? []) typeIds.add(o.type_id);
      const typeNames = await loadTypeNames([...typeIds]);
      if (cancelled) return;
      setSnapshot({ requestKey, ordersResult, historyResult, typeNames });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- requestKey is derived from these same deps
  }, [activeCharacterId, refreshKey]);

  const current = snapshot?.requestKey === requestKey ? snapshot : null;
  const loading = current === null;
  const ordersResult = current?.ordersResult ?? null;
  const historyResult = current?.historyResult ?? null;
  const typeNames = useMemo(() => current?.typeNames ?? new Map<number, string>(), [current]);

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
        render: (order) => typeNames.get(order.type_id) ?? `Type #${order.type_id}`,
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
  const historyColumns = useMemo<DataTableColumn<MarketOrder>[]>(
    () => [
      ...baseColumns,
      {
        id: 'state',
        header: t('orders.state'),
        className: 'text-text-dim',
        render: (order) => ('state' in order ? (order as MarketOrderHistory).state : ''),
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
        <Button size="sm" onClick={() => setRefreshKey((k) => k + 1)} disabled={loading}>
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
