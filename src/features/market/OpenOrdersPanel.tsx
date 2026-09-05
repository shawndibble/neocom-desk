import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  DataAgeBadge,
  DataTable,
  EmptyState,
  FilterChip,
  IconButton,
  Panel,
  ReauthBanner,
  SearchInput,
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

interface OrdersFilter {
  text: string;
  side: 'buy' | 'sell' | null;
}

const EMPTY_ORDERS_FILTER: OrdersFilter = { text: '', side: null };

function filterOrders(
  orders: readonly MarketOrder[],
  filter: OrdersFilter,
  typeNames: ReadonlyMap<number, string>
): MarketOrder[] {
  const query = filter.text.trim().toLowerCase();
  return orders.filter((order) => {
    if (filter.side === 'buy' && !order.is_buy_order) return false;
    if (filter.side === 'sell' && order.is_buy_order) return false;
    if (query && !(typeNames.get(order.type_id) ?? '').toLowerCase().includes(query)) return false;
    return true;
  });
}

interface OrdersFilterBarProps {
  filter: OrdersFilter;
  onChange: (filter: OrdersFilter) => void;
}

/** Search plus buy/sell filter chips above a market orders table. */
function OrdersFilterBar({ filter, onChange }: OrdersFilterBarProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
      <SearchInput
        value={filter.text}
        onChange={(event) => onChange({ ...filter, text: event.target.value })}
        placeholder={t('orders.searchPlaceholder')}
        className="min-w-48 flex-1"
      />
      <FilterChip
        label={t('orders.buy')}
        selected={filter.side === 'buy'}
        onToggle={() => onChange({ ...filter, side: filter.side === 'buy' ? null : 'buy' })}
      />
      <FilterChip
        label={t('orders.sell')}
        selected={filter.side === 'sell'}
        onToggle={() => onChange({ ...filter, side: filter.side === 'sell' ? null : 'sell' })}
      />
    </div>
  );
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
  const [filter, setFilter] = useState<OrdersFilter>(EMPTY_ORDERS_FILTER);

  const orders = useMemo(
    () => [...(ordersResult?.data ?? [])].sort((a, b) => b.issued.localeCompare(a.issued)),
    [ordersResult]
  );

  const filteredOrders = useMemo(
    () => filterOrders(orders, filter, typeNames),
    [orders, filter, typeNames]
  );

  const columns = useMemo<DataTableColumn<MarketOrder>[]>(
    () => [
      {
        id: 'item',
        header: t('orders.item'),
        sortValue: (order) => typeNames.get(order.type_id) ?? `Type #${order.type_id}`,
        render: (order) => (
          <MarketItemLink typeId={order.type_id}>
            {typeNames.get(order.type_id) ?? `Type #${order.type_id}`}
          </MarketItemLink>
        ),
      },
      {
        id: 'side',
        header: t('orders.side'),
        sortValue: (order) => (order.is_buy_order ? t('orders.buy') : t('orders.sell')),
        render: (order) => (order.is_buy_order ? t('orders.buy') : t('orders.sell')),
      },
      {
        id: 'price',
        header: t('orders.price'),
        align: 'right',
        className: 'tabular-nums',
        sortValue: (order) => order.price,
        render: (order) => formatIsk(order.price, 2),
      },
      {
        id: 'remaining',
        header: t('orders.remaining'),
        align: 'right',
        className: 'tabular-nums',
        sortValue: (order) => order.volume_remain,
        render: (order) =>
          `${order.volume_remain.toLocaleString()} / ${order.volume_total.toLocaleString()}`,
      },
      {
        id: 'issued',
        header: t('orders.issued'),
        className: 'whitespace-nowrap text-text-dim',
        sortValue: (order) => new Date(order.issued).getTime(),
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
                disabled={filteredOrders.length === 0}
                onClick={() =>
                  downloadCsv('orders-open', filteredOrders, ordersCsvColumns(t, nameFor))
                }
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
          <OrdersFilterBar filter={filter} onChange={setFilter} />
          {filteredOrders.length === 0 ? (
            <EmptyState title={t('orders.noResults')} className="py-8" />
          ) : (
            <DataTable
              columns={columns}
              rows={filteredOrders}
              rowKey={(order) => order.order_id}
              label={t('orders.openTab')}
            />
          )}
        </>
      )}
    </Panel>
  );
}
