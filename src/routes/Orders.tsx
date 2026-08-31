import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataAgeBadge,
  EmptyState,
  Panel,
  ReauthBanner,
  Spinner,
  Tabs,
} from '@/components/ui';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { beginEveLogin } from '@/app/loginFlow';
import { loadOrders, loadOrderHistory } from '@/features/character/orders';
import type { CachedResult } from '@/esi/cache';
import { loadTypeNames } from '@/features/character/typeNames';
import { formatIsk } from '@/features/character/format';
import type { MarketOrder, MarketOrderHistory } from '@/esi/endpoints';

interface Snapshot {
  requestKey: string;
  ordersResult: CachedResult<MarketOrder[]> | null;
  historyResult: CachedResult<MarketOrderHistory[]> | null;
  /** 401/403 (or a failed token refresh) means "log in again", not "offline". */
  ordersNeedsReauth: boolean;
  historyNeedsReauth: boolean;
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
      const [ordersStatus, historyStatus] = await Promise.all([
        loadOrders(activeCharacterId),
        loadOrderHistory(activeCharacterId),
      ]);
      if (cancelled) return;
      const { cached: ordersResult, needsReauth: ordersNeedsReauth } = ordersStatus;
      const { cached: historyResult, needsReauth: historyNeedsReauth } = historyStatus;
      const typeIds = new Set<number>();
      for (const o of ordersResult?.data ?? []) typeIds.add(o.type_id);
      for (const o of historyResult?.data ?? []) typeIds.add(o.type_id);
      const typeNames = await loadTypeNames([...typeIds]);
      if (cancelled) return;
      setSnapshot({
        requestKey,
        ordersResult,
        historyResult,
        ordersNeedsReauth,
        historyNeedsReauth,
        typeNames,
      });
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
  const ordersNeedsReauth = current?.ordersNeedsReauth ?? false;
  const historyNeedsReauth = current?.historyNeedsReauth ?? false;
  const typeNames = current?.typeNames ?? new Map<number, string>();

  const orders = useMemo(
    () => [...(ordersResult?.data ?? [])].sort((a, b) => b.issued.localeCompare(a.issued)),
    [ordersResult]
  );
  const history = useMemo(
    () => [...(historyResult?.data ?? [])].sort((a, b) => b.issued.localeCompare(a.issued)),
    [historyResult]
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

  function renderRows(rows: MarketOrder[], withState: boolean) {
    return (
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-line text-left text-text-dim">
            <th className="px-3 py-2 font-semibold uppercase">{t('orders.item')}</th>
            <th className="px-3 py-2 font-semibold uppercase">{t('orders.side')}</th>
            <th className="px-3 py-2 text-right font-semibold uppercase">{t('orders.price')}</th>
            <th className="px-3 py-2 text-right font-semibold uppercase">
              {t('orders.remaining')}
            </th>
            <th className="px-3 py-2 font-semibold uppercase">{t('orders.issued')}</th>
            {withState && (
              <th className="px-3 py-2 font-semibold uppercase">{t('orders.state')}</th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((order) => (
            <tr key={order.order_id}>
              <td className="px-3 py-1.5">
                {typeNames.get(order.type_id) ?? `Type #${order.type_id}`}
              </td>
              <td className="px-3 py-1.5">
                {order.is_buy_order ? t('orders.buy') : t('orders.sell')}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums">{formatIsk(order.price)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">
                {order.volume_remain.toLocaleString()} / {order.volume_total.toLocaleString()}
              </td>
              <td className="px-3 py-1.5 whitespace-nowrap text-text-dim">
                {new Date(order.issued).toLocaleDateString()}
              </td>
              {withState && (
                <td className="px-3 py-1.5 text-text-dim">
                  {'state' in order ? (order as MarketOrderHistory).state : ''}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

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
                <p className="px-3 pt-2 text-[11px] text-warning uppercase">
                  {t('common.offlineTitle')}
                </p>
              )}
              {renderRows(orders, false)}
            </>
          )}
        </Panel>
      ) : (
        <Panel
          padded={false}
          actions={historyResult ? <DataAgeBadge date={historyResult.fetchedAt} /> : undefined}
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
                <p className="px-3 pt-2 text-[11px] text-warning uppercase">
                  {t('common.offlineTitle')}
                </p>
              )}
              {renderRows(history, true)}
            </>
          )}
        </Panel>
      )}
    </div>
  );
}
