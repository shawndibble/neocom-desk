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
import { loadOrderHistory } from '@/features/character/orders';
import { MarketItemLink } from './MarketItemLink';
import type { CachedResult } from '@/esi/cache';
import { loadTypeNames } from '@/features/character/typeNames';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { formatIsk } from '@/lib/isk';
import { downloadCsv } from '@/lib/downloadCsv';
import { orderHistoryCsvColumns } from '@/features/character/ordersCsv';
import type { MarketOrderHistory } from '@/esi/endpoints';
import { HistoryViewSelect, type HistoryView } from './HistoryViewSelect';

/** Stable identity, so the fallback doesn't invalidate the column memo every render. */
const NO_TYPE_NAMES: ReadonlyMap<number, string> = new Map();

interface Snapshot {
  historyResult: CachedResult<MarketOrderHistory[]> | null;
  /** 401/403 (or a failed token refresh) means "log in again", not "offline". */
  historyNeedsReauth: boolean;
  /** Fewer pages came back than ESI advertised — the list below is partial. */
  historyTruncated: boolean;
  typeNames: Map<number, string>;
}

async function loadOrderHistorySnapshot(
  characterId: number,
  signal: RouteSnapshotSignal
): Promise<Snapshot> {
  const { cached: historyResult, needsReauth: historyNeedsReauth } =
    await loadOrderHistory(characterId);
  const historyTruncated = historyResult?.truncated ?? false;
  const typeIds = new Set<number>();
  // Already superseded: skip the ESI name resolve, its result would be discarded.
  if (!signal.cancelled) {
    for (const o of historyResult?.data ?? []) typeIds.add(o.type_id);
  }
  const typeNames = await loadTypeNames([...typeIds]);
  return { historyResult, historyNeedsReauth, historyTruncated, typeNames };
}

interface HistoryFilter {
  text: string;
  side: 'buy' | 'sell' | null;
  state: MarketOrderHistory['state'] | null;
}

const EMPTY_HISTORY_FILTER: HistoryFilter = { text: '', side: null, state: null };

function filterHistory(
  history: readonly MarketOrderHistory[],
  filter: HistoryFilter,
  typeNames: ReadonlyMap<number, string>
): MarketOrderHistory[] {
  const query = filter.text.trim().toLowerCase();
  return history.filter((order) => {
    if (filter.side === 'buy' && !order.is_buy_order) return false;
    if (filter.side === 'sell' && order.is_buy_order) return false;
    if (filter.state && order.state !== filter.state) return false;
    if (query && !(typeNames.get(order.type_id) ?? '').toLowerCase().includes(query)) return false;
    return true;
  });
}

interface HistoryFilterBarProps {
  filter: HistoryFilter;
  onChange: (filter: HistoryFilter) => void;
}

/** Search plus buy/sell/state filter chips above the order history table. */
function HistoryFilterBar({ filter, onChange }: HistoryFilterBarProps) {
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
      <FilterChip
        label={t('orders.stateExpired')}
        selected={filter.state === 'expired'}
        onToggle={() =>
          onChange({ ...filter, state: filter.state === 'expired' ? null : 'expired' })
        }
      />
      <FilterChip
        label={t('orders.stateCancelled')}
        selected={filter.state === 'cancelled'}
        onToggle={() =>
          onChange({ ...filter, state: filter.state === 'cancelled' ? null : 'cancelled' })
        }
      />
    </div>
  );
}

interface OrderHistoryPanelProps {
  /** Switches the History tab to its other view; the picker lives in this panel's header. */
  onViewChange: (view: HistoryView) => void;
}

/** Market's History tab, Orders view: a character's completed/expired/cancelled market orders. */
export function OrderHistoryPanel({ onViewChange }: OrderHistoryPanelProps) {
  const { t } = useTranslation();
  const { data, error, loading, hydrated, activeCharacterId, refresh } =
    useRouteSnapshot(loadOrderHistorySnapshot);

  const historyResult = data?.historyResult ?? null;
  const historyNeedsReauth = data?.historyNeedsReauth ?? false;
  const historyTruncated = data?.historyTruncated ?? false;
  const typeNames = data?.typeNames ?? NO_TYPE_NAMES;
  const nameFor = (typeId: number) => typeNames.get(typeId) ?? `Type #${typeId}`;
  const [filter, setFilter] = useState<HistoryFilter>(EMPTY_HISTORY_FILTER);

  const history = useMemo(
    () => [...(historyResult?.data ?? [])].sort((a, b) => b.issued.localeCompare(a.issued)),
    [historyResult]
  );

  const filteredHistory = useMemo(
    () => filterHistory(history, filter, typeNames),
    [history, filter, typeNames]
  );

  const columns = useMemo<DataTableColumn<MarketOrderHistory>[]>(
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
      {
        id: 'state',
        header: t('orders.state'),
        className: 'text-text-dim',
        sortValue: (order) => order.state,
        render: (order) => order.state,
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
        <span className="flex w-full items-center justify-between gap-2">
          <HistoryViewSelect value="history" onChange={onViewChange} />
          <span className="flex items-center gap-2">
            <IconButton
              size="sm"
              icon={<Icon.Refresh />}
              label={t('orders.refresh')}
              onClick={refresh}
            />
            {historyResult && (
              <>
                <IconButton
                  size="sm"
                  icon={<Icon.Download />}
                  label={t('orders.exportCsvHistory')}
                  disabled={filteredHistory.length === 0}
                  onClick={() =>
                    downloadCsv(
                      'orders-history',
                      filteredHistory,
                      orderHistoryCsvColumns(t, nameFor),
                      new Date(),
                      historyTruncated
                    )
                  }
                />
                <DataAgeBadge date={historyResult.fetchedAt} />
              </>
            )}
          </span>
        </span>
      }
    >
      {historyNeedsReauth ? (
        <div className="px-3 py-2">
          <ReauthBanner
            title={t('orders.reauthTitle')}
            hint={t('orders.reauthHint')}
            actionLabel={t('orders.reauthAction')}
            onLogin={() => void beginEveLogin()}
          />
        </div>
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
          <HistoryFilterBar filter={filter} onChange={setFilter} />
          {filteredHistory.length === 0 ? (
            <EmptyState title={t('orders.noResults')} className="py-8" />
          ) : (
            <DataTable
              columns={columns}
              rows={filteredHistory}
              rowKey={(order) => order.order_id}
              label={t('orders.historyTab')}
            />
          )}
        </>
      )}
    </Panel>
  );
}
