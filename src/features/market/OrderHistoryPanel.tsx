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

  const history = useMemo(
    () => [...(historyResult?.data ?? [])].sort((a, b) => b.issued.localeCompare(a.issued)),
    [historyResult]
  );

  const columns = useMemo<DataTableColumn<MarketOrderHistory>[]>(
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
      {
        id: 'state',
        header: t('orders.state'),
        className: 'text-text-dim',
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
          <DataTable
            columns={columns}
            rows={history}
            rowKey={(order) => order.order_id}
            label={t('orders.historyTab')}
          />
        </>
      )}
    </Panel>
  );
}
