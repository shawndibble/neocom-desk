import { useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  DataAgeBadge,
  DataTable,
  EmptyState,
  IconButton,
  Panel,
  ReauthBanner,
  Spinner,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { beginEveLogin } from '@/app/loginFlow';
import { loadOrders } from '@/features/character/orders';
import { MarketItemLink } from './MarketItemLink';
import type { CachedResult } from '@/esi/cache';
import { loadTypeNames } from '@/features/character/typeNames';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { formatIsk } from '@/lib/isk';
import { downloadCsv } from '@/lib/downloadCsv';
import { ordersCsvColumns } from '@/features/character/ordersCsv';
import type { MarketOrder } from '@/esi/endpoints';

/** Stable identity, so the fallback doesn't invalidate the column memo every render. */
const NO_TYPE_NAMES: ReadonlyMap<number, string> = new Map();

interface Snapshot {
  ordersResult: CachedResult<MarketOrder[]> | null;
  /** 401/403 (or a failed token refresh) means "log in again", not "offline". */
  ordersNeedsReauth: boolean;
  typeNames: Map<number, string>;
}

async function loadOpenOrdersSnapshot(
  characterId: number,
  signal: RouteSnapshotSignal
): Promise<Snapshot> {
  const { cached: ordersResult, needsReauth: ordersNeedsReauth } = await loadOrders(characterId);
  const typeIds = new Set<number>();
  // Already superseded: skip the ESI name resolve, its result would be discarded.
  if (!signal.cancelled) {
    for (const o of ordersResult?.data ?? []) typeIds.add(o.type_id);
  }
  const typeNames = await loadTypeNames([...typeIds]);
  return { ordersResult, ordersNeedsReauth, typeNames };
}

/** Market's Open Orders tab: a character's currently active market orders. */
export function OpenOrdersPanel() {
  const { t } = useTranslation();
  const { data, error, loading, hydrated, activeCharacterId, refresh } =
    useRouteSnapshot(loadOpenOrdersSnapshot);

  const ordersResult = data?.ordersResult ?? null;
  const ordersNeedsReauth = data?.ordersNeedsReauth ?? false;
  const typeNames = data?.typeNames ?? NO_TYPE_NAMES;
  const nameFor = (typeId: number) => typeNames.get(typeId) ?? `Type #${typeId}`;

  const orders = useMemo(
    () => [...(ordersResult?.data ?? [])].sort((a, b) => b.issued.localeCompare(a.issued)),
    [ordersResult]
  );

  const columns = useMemo<DataTableColumn<MarketOrder>[]>(
    () => [
      {
        id: 'item',
        header: t('orders.item'),
        render: (order) => (
          <MarketItemLink typeId={order.type_id}>
            {typeNames.get(order.type_id) ?? `Type #${order.type_id}`}
          </MarketItemLink>
        ),
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

  if (!hydrated) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  if (loading) {
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
        <span className="flex items-center gap-2">
          <IconButton
            size="sm"
            icon={<Icon.Refresh />}
            label={t('orders.refresh')}
            onClick={refresh}
          />
          {ordersResult && (
            <>
              <IconButton
                size="sm"
                icon={<Icon.Download />}
                label={t('orders.exportCsvOpen')}
                disabled={orders.length === 0}
                onClick={() => downloadCsv('orders-open', orders, ordersCsvColumns(t, nameFor))}
              />
              <DataAgeBadge date={ordersResult.fetchedAt} />
            </>
          )}
        </span>
      }
    >
      {ordersNeedsReauth ? (
        <div className="px-3 py-2">
          <ReauthBanner
            title={t('orders.reauthTitle')}
            hint={t('orders.reauthHint')}
            actionLabel={t('orders.reauthAction')}
            onLogin={() => void beginEveLogin()}
          />
        </div>
      ) : !ordersResult || orders.length === 0 ? (
        <EmptyState title={t('orders.emptyTitle')} hint={t('orders.emptyHint')} className="py-8" />
      ) : (
        <>
          {ordersResult.fromCache && (
            <p className="px-3 pt-2 text-[0.6875rem] text-warning uppercase">
              {t('common.offlineTitle')}
            </p>
          )}
          <DataTable
            columns={columns}
            rows={orders}
            rowKey={(order) => order.order_id}
            label={t('orders.openTab')}
          />
        </>
      )}
    </Panel>
  );
}
