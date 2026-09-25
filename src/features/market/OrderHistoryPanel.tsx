import { useCallback, useMemo, type ReactElement, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ColumnPickerMenu,
  DataAgeBadge,
  DataTable,
  CachedEmptyState,
  EmptyState,
  FilterBar,
  FilterChip,
  IconButton,
  IskAmount,
  Panel,
  SearchInput,
  Spinner,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { GrantBanner } from '@/app/GrantNote';
import { loadOrderHistory } from '@/features/character/orders';
import { ItemContextMenu } from './ItemContextMenu';
import { OrderHistoryList } from './OrderHistoryList';
import { useIsPhone } from '@/lib/useIsPhone';
import { MarketItemLink } from './MarketItemLink';
import type { CachedResult } from '@/esi/cache';
import { loadTypeNames } from '@/features/character/typeNames';
import type { BlueprintCatalog } from '@/features/industry/blueprintCatalog';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { useUrlFilter, useUrlSort } from '@/lib/useUrlState';
import { useColumnVisibility } from '@/lib/columnVisibility';
import { downloadCsv } from '@/lib/downloadCsv';
import { orderHistoryCsvColumns } from '@/features/character/ordersCsv';
import type { MarketOrderHistory } from '@/esi/endpoints';
import { HistoryViewSelect, type HistoryView } from './HistoryViewSelect';
import {
  activeHistoryFilterCount,
  DEFAULT_HISTORY_FILTER_PARAMS,
  filterHistory,
  HISTORY_FIELD_TO_PARAM,
  HISTORY_FILTER_PARAMS,
  type HistoryFilter,
} from './orderHistoryFilter';
import {
  ORDER_HISTORY_COLUMN_IDS,
  useVisibleOrderHistoryColumns,
  type OrderHistoryColumnId,
} from './orderHistoryColumns';

const HISTORY_SORT = { columnId: 'issued', direction: 'desc' } as const;

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

interface HistoryFilterBarProps {
  filter: HistoryFilter;
  onChange: (filter: HistoryFilter) => void;
  /** The column picker — omitted on a phone, where `OrderHistoryList` renders instead and ignores it. */
  actions?: ReactNode;
}

/** Search plus buy/sell/state filter chips above the order history table. */
function HistoryFilterBar({ filter, onChange, actions }: HistoryFilterBarProps) {
  const { t } = useTranslation();
  return (
    <FilterBar
      value={filter}
      onChange={onChange}
      activeCount={activeHistoryFilterCount(filter)}
      className="border-b border-line px-3 py-2"
      actions={actions}
      search={
        <SearchInput
          value={filter.text}
          onChange={(event) => onChange({ ...filter, text: event.target.value })}
          placeholder={t('orders.searchPlaceholder')}
          className="min-w-48 flex-1"
        />
      }
    >
      {(draft, setDraft) => (
        <>
          <FilterChip
            label={t('orders.buy')}
            selected={draft.side === 'buy'}
            onToggle={() => setDraft({ ...draft, side: draft.side === 'buy' ? null : 'buy' })}
          />
          <FilterChip
            label={t('orders.sell')}
            selected={draft.side === 'sell'}
            onToggle={() => setDraft({ ...draft, side: draft.side === 'sell' ? null : 'sell' })}
          />
          <FilterChip
            label={t('orders.stateExpired')}
            selected={draft.state === 'expired'}
            onToggle={() =>
              setDraft({ ...draft, state: draft.state === 'expired' ? null : 'expired' })
            }
          />
          <FilterChip
            label={t('orders.stateCancelled')}
            selected={draft.state === 'cancelled'}
            onToggle={() =>
              setDraft({ ...draft, state: draft.state === 'cancelled' ? null : 'cancelled' })
            }
          />
        </>
      )}
    </FilterBar>
  );
}

interface OrderHistoryPanelProps {
  /** Switches the History tab to its other view; the picker lives in this panel's header. */
  onViewChange: (view: HistoryView) => void;
  /** Same per-item context menu as Appraisal: null until requested, then per-typeId lookups. */
  blueprintCatalog: BlueprintCatalog | null;
  onRequestBlueprintCatalog: () => void;
  onAddToQuickbar: (typeId: number, itemName: string) => void;
  quickbarAvailable: boolean;
  onShowInfo: (typeId: number, itemName: string) => void;
}

/** Market's History tab, Orders view: a character's completed/expired/cancelled market orders. */
export function OrderHistoryPanel({
  onViewChange,
  blueprintCatalog,
  onRequestBlueprintCatalog,
  onAddToQuickbar,
  quickbarAvailable,
  onShowInfo,
}: OrderHistoryPanelProps) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const { data, error, loading, hydrated, activeCharacterId, refresh } = useRouteSnapshot(
    loadOrderHistorySnapshot,
    undefined,
    { cacheKey: 'market:order-history' }
  );

  const historyResult = data?.historyResult ?? null;
  const historyNeedsReauth = data?.historyNeedsReauth ?? false;
  const historyTruncated = data?.historyTruncated ?? false;
  const typeNames = data?.typeNames ?? NO_TYPE_NAMES;
  const nameFor = useCallback(
    (typeId: number) => typeNames.get(typeId) ?? `Type #${typeId}`,
    [typeNames]
  );
  // This tab has only the one filter bar, so it never needs `useUrlFilter`'s
  // scope-reset — the scope key never changes.
  const [filter, setFilter] = useUrlFilter<HistoryFilter>(
    'history',
    HISTORY_FILTER_PARAMS,
    HISTORY_FIELD_TO_PARAM,
    DEFAULT_HISTORY_FILTER_PARAMS
  );

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
        render: (order) => <IskAmount value={order.price} revealOn="longPress" />,
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
  const sortProps = useUrlSort(
    'history.sort',
    HISTORY_SORT,
    columns.map((column) => column.id)
  );

  const {
    visible: visibleColumnIds,
    isVisible: isColumnVisible,
    toggle: toggleColumn,
    reset: resetColumns,
  } = useColumnVisibility(useVisibleOrderHistoryColumns, ORDER_HISTORY_COLUMN_IDS);
  // `item` is not in `ORDER_HISTORY_COLUMN_IDS` — the row's identity, never optional.
  const tableColumns = useMemo(
    () =>
      columns.filter(
        (column) => column.id === 'item' || isColumnVisible(column.id as OrderHistoryColumnId)
      ),
    [columns, isColumnVisible]
  );
  const columnsById = useMemo(
    () =>
      Object.fromEntries(
        columns.filter((column) => column.id !== 'item').map((column) => [column.id, column])
      ) as Record<OrderHistoryColumnId, DataTableColumn<MarketOrderHistory>>,
    [columns]
  );

  /** Same menu the Appraisal ledger carries — an order-history row names an item like any other. */
  function rowContextMenu(order: MarketOrderHistory, tr: ReactElement) {
    const itemName = nameFor(order.type_id);
    const blueprintTypeID =
      blueprintCatalog === null
        ? undefined
        : (blueprintCatalog.byProductTypeID.get(order.type_id)?.blueprintTypeID ?? null);
    return (
      <ItemContextMenu
        typeId={order.type_id}
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
          <HistoryViewSelect value="history" onChange={onViewChange} />
          <span className="flex items-center gap-2">
            <IconButton
              size={isPhone ? 'md' : 'sm'}
              icon={<Icon.Refresh />}
              label={t('orders.refresh')}
              onClick={refresh}
            />
            {historyResult && (
              <>
                <IconButton
                  size={isPhone ? 'md' : 'sm'}
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
          <GrantBanner
            characterId={activeCharacterId}
            endpoints={['getCharacterOrderHistory']}
            title={t('orders.reauthTitle')}
            hint={t('orders.reauthHint')}
            actionLabel={t('orders.reauthAction')}
          />
        </div>
      ) : !historyResult || history.length === 0 ? (
        <CachedEmptyState
          result={historyResult}
          title={t('orders.historyEmptyTitle')}
          hint={t('orders.historyEmptyHint')}
          fetchedTitle={t('orders.historyEmptyFetchedTitle')}
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
          <HistoryFilterBar
            filter={filter}
            onChange={setFilter}
            actions={
              !isPhone && (
                <ColumnPickerMenu
                  available={ORDER_HISTORY_COLUMN_IDS}
                  visible={visibleColumnIds}
                  columnsById={columnsById}
                  onToggle={toggleColumn}
                  buttonLabel={t('common.columnsButton')}
                  menuTitle={t('common.columnsMenuTitle')}
                  onReset={resetColumns}
                  resetLabel={t('common.resetColumns')}
                />
              )
            }
          />
          {filteredHistory.length === 0 ? (
            <EmptyState
              title={t('orders.noResults')}
              hint={t('orders.noResultsHint')}
              className="py-8"
            />
          ) : isPhone ? (
            <OrderHistoryList
              orders={filteredHistory}
              nameFor={nameFor}
              label={t('orders.historyTab')}
              rowContextMenu={rowContextMenu}
            />
          ) : (
            <DataTable
              columns={tableColumns}
              rows={filteredHistory}
              rowKey={(order) => order.order_id}
              label={t('orders.historyTab')}
              rowContextMenu={rowContextMenu}
              rowMoreActions
              {...sortProps}
            />
          )}
        </>
      )}
    </Panel>
  );
}
