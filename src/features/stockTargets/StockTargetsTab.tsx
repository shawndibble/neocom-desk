/**
 * Assets › Targets: the pilot's **Stock Lists**, each **Stock Target** against
 * what their Characters hold and have listed, worst first (issue #3521).
 *
 * Two views of one list. Manager reads every Stock Target with its Shortfall
 * and cost to fill; Builder keeps only what is short and splits it by whether
 * the active Character holds a blueprint for it, so an industry pilot sees
 * what to build and can hand the lot to a Build Group.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataAgeBadge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  FilterChip,
  IconButton,
  LiveStatus,
  Panel,
  SegmentedControl,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  StatChip,
  StatChips,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import {
  addStockList,
  removeStockList,
  renameStockList,
  setStockListLocation,
  setStockTarget,
  removeStockTarget,
  type StockList,
} from '@/engine/stockTargets/stockLists';
import { STOCK_STATUSES, summarizeStock, type StockStatus } from '@/engine/stockTargets/stockRows';
import { useMarketHub } from '@/features/market/hub';
import { DEFAULT_TRADE_HUB, getTradeHub } from '@/market/hubs';
import { formatIskCompact } from '@/lib/isk';
import {
  AddStockItemsDialog,
  DeleteStockListDialog,
  StockListNameDialog,
} from './StockListDialogs';
import { StockBuilderView } from './StockBuilderView';
import { StockManagerTable } from './StockManagerTable';
import { newStockListId, useSelectedStockList, useStockLists } from './stockListsStore';
import { loadStockTargetsData, type StockTargetsData } from './stockTargetsData';

type View = 'manager' | 'builder';
type Dialog = 'new' | 'rename' | 'delete' | 'add' | null;

const ANYWHERE = 'anywhere';

export function StockTargetsTab({ activeCharacterId }: { activeCharacterId: number | null }) {
  const { t } = useTranslation();
  const lists = useStockLists((state) => state.value);
  const listsHydrated = useStockLists((state) => state.hydrated);
  const hydrateLists = useStockLists((state) => state.hydrate);
  const setLists = useStockLists((state) => state.setValue);
  const selectedId = useSelectedStockList((state) => state.value);
  const hydrateSelected = useSelectedStockList((state) => state.hydrate);
  const setSelectedId = useSelectedStockList((state) => state.setValue);
  const hubId = useMarketHub((state) => state.value);
  const hydrateHub = useMarketHub((state) => state.hydrate);
  useEffect(() => {
    void hydrateLists();
    void hydrateSelected();
    void hydrateHub();
  }, [hydrateLists, hydrateSelected, hydrateHub]);
  const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;

  const list = lists.find((l) => l.id === selectedId) ?? lists[0] ?? null;
  const [view, setView] = useState<View>('manager');
  const [statusFilter, setStatusFilter] = useState<StockStatus | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [loaded, setLoaded] = useState<{ key: string; data: StockTargetsData } | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  // Re-read whenever the list's contents, its location or the hub change.
  const loadKey = list
    ? `${JSON.stringify(list.items)}|${list.locationId}|${hub.id}|${refreshKey}`
    : null;
  useEffect(() => {
    if (!list || loadKey === null) return;
    let cancelled = false;
    loadStockTargetsData(list, hub)
      .then((data) => {
        if (!cancelled) setLoaded({ key: loadKey, data });
      })
      .catch(() => {
        if (!cancelled) setFailedKey(loadKey);
      });
    return () => {
      cancelled = true;
    };
    // `list` and `hub` are captured through `loadKey`, which names everything that changes the result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadKey]);

  // Last good rows stay up while a refresh after an edit runs, so the table doesn't flash.
  const data = loaded?.data ?? null;
  const loading = loadKey !== null && loaded?.key !== loadKey && failedKey !== loadKey;
  const failed = failedKey === loadKey && loaded?.key !== loadKey;
  const summary = useMemo(() => (data ? summarizeStock(data.rows) : null), [data]);

  function update(next: StockList[]) {
    void setLists(next);
  }

  if (!listsHydrated) return <Spinner label={t('common.loading')} />;

  const dialogs = (
    <>
      {dialog === 'new' && (
        <StockListNameDialog
          title={t('stockTargets.list.newTitle')}
          confirmLabel={t('stockTargets.list.create')}
          initialName=""
          onSubmit={(name) => {
            const id = newStockListId();
            update(addStockList(lists, { id, name }));
            void setSelectedId(id);
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'rename' && list && (
        <StockListNameDialog
          title={t('stockTargets.list.renameTitle')}
          confirmLabel={t('stockTargets.list.rename')}
          initialName={list.name}
          onSubmit={(name) => update(renameStockList(lists, list.id, name))}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'delete' && list && (
        <DeleteStockListDialog
          name={list.name}
          onConfirm={() => update(removeStockList(lists, list.id))}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'add' && list && (
        <AddStockItemsDialog
          listName={list.name}
          onAdd={(items) =>
            update(
              items.reduce(
                (acc, item) => setStockTarget(acc, list.id, item.typeId, item.quantity),
                lists
              )
            )
          }
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );

  if (!list) {
    return (
      <>
        <EmptyState
          title={t('stockTargets.emptyTitle')}
          hint={t('stockTargets.emptyHint')}
          action={
            <Button variant="primary" onClick={() => setDialog('new')}>
              {t('stockTargets.list.new')}
            </Button>
          }
        />
        {dialogs}
      </>
    );
  }

  const rows = data?.rows ?? [];
  const filteredRows =
    statusFilter === null ? rows : rows.filter((row) => row.status === statusFilter);
  const countOf = (status: StockStatus) => rows.filter((row) => row.status === status).length;
  const viewSwitch = (
    <SegmentedControl<View>
      label={t('stockTargets.view.label')}
      value={view}
      onChange={setView}
      options={[
        { value: 'manager', label: t('stockTargets.view.manager') },
        { value: 'builder', label: t('stockTargets.view.builder') },
      ]}
    />
  );
  const nameOf = (typeId: number) =>
    data?.names.get(typeId) ?? t('common.unknownType', { id: typeId });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={list.id} onValueChange={(id) => void setSelectedId(id)}>
          <SelectTrigger
            aria-label={t('stockTargets.list.pickerLabel')}
            className="max-w-full min-w-40 font-semibold sm:w-auto"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {lists.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              icon={<Icon.More />}
              label={t('stockTargets.list.actionsLabel', { name: list.name })}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => setDialog('new')}>
              {t('stockTargets.list.new')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setDialog('rename')}>
              {t('stockTargets.list.renameEllipsis')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setDialog('delete')}>
              {t('stockTargets.list.deleteEllipsis')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="flex-1" />
        <Select
          value={list.locationId === null ? ANYWHERE : String(list.locationId)}
          onValueChange={(v) =>
            update(setStockListLocation(lists, list.id, v === ANYWHERE ? null : Number(v)))
          }
        >
          <SelectTrigger
            aria-label={t('stockTargets.countAt.label')}
            className="max-w-full min-w-0 sm:max-w-72"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANYWHERE}>{t('stockTargets.countAt.anywhere')}</SelectItem>
            {(data?.locations ?? []).map((location) => (
              <SelectItem key={location.id} value={String(location.id)}>
                {t('stockTargets.countAt.at', { name: location.name })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="primary" onClick={() => setDialog('add')}>
          {t('stockTargets.add.open')}
        </Button>
      </div>

      {summary && (
        <StatChips>
          <StatChip
            label={t('stockTargets.summary.out')}
            value={t('stockTargets.summary.items', { count: summary.out })}
            tone={summary.out > 0 ? 'danger' : 'default'}
            emphasis
          />
          <StatChip
            label={t('stockTargets.summary.low')}
            value={t('stockTargets.summary.items', { count: summary.low })}
            tone={summary.low > 0 ? 'warning' : 'default'}
            emphasis
          />
          <StatChip
            label={t('stockTargets.summary.costToFill')}
            value={`${formatIskCompact(summary.costToFill)} ISK`}
            tooltip={t('stockTargets.summary.costToFillHint', { hub: hub.name })}
            emphasis
          />
          {data?.oldestFetchedAt && <DataAgeBadge date={data.oldestFetchedAt} alwaysVisible />}
          {loading && <Spinner size="sm" label={t('common.loading')} />}
        </StatChips>
      )}

      {data && data.incompleteCharacters.length > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-warning">
          <Icon.Warn size={Icon.ICON_SIZE.sm} aria-hidden="true" />
          {t('stockTargets.incomplete', { names: data.incompleteCharacters.join(', ') })}
        </p>
      )}

      {view === 'manager' && (
        <div className="flex flex-wrap items-center gap-2">
          {viewSwitch}
          {rows.length > 0 && (
            <div
              role="group"
              aria-label={t('stockTargets.filterLabel')}
              className="flex flex-wrap items-center gap-1.5"
            >
              <FilterChip
                label={t('stockTargets.filterAll')}
                count={rows.length}
                selected={statusFilter === null}
                onToggle={() => setStatusFilter(null)}
              />
              {STOCK_STATUSES.map((status) => (
                <FilterChip
                  key={status}
                  label={t(`stockTargets.status.${status}`)}
                  count={countOf(status)}
                  selected={statusFilter === status}
                  onToggle={() => setStatusFilter(statusFilter === status ? null : status)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <LiveStatus>
        {data && t('stockTargets.liveSummary', { out: summary?.out ?? 0, low: summary?.low ?? 0 })}
      </LiveStatus>

      {list.items.length === 0 ? (
        <EmptyState
          title={t('stockTargets.listEmptyTitle')}
          hint={t('stockTargets.listEmptyHint')}
          action={<Button onClick={() => setDialog('add')}>{t('stockTargets.add.open')}</Button>}
        />
      ) : failed ? (
        <EmptyState
          title={t('common.loadFailedTitle')}
          hint={t('stockTargets.loadFailedHint')}
          action={<Button onClick={() => setRefreshKey((k) => k + 1)}>{t('common.retry')}</Button>}
        />
      ) : !data ? (
        <Spinner label={t('common.loading')} />
      ) : view === 'manager' ? (
        filteredRows.length === 0 ? (
          <EmptyState
            title={t('stockTargets.filteredEmpty')}
            action={
              <Button onClick={() => setStatusFilter(null)}>{t('common.resetFilters')}</Button>
            }
          />
        ) : (
          <Panel padded={false}>
            <StockManagerTable
              rows={filteredRows}
              nameOf={nameOf}
              onSetTarget={(typeId, target) =>
                update(setStockTarget(lists, list.id, typeId, target))
              }
              onRemove={(typeId) => update(removeStockTarget(lists, list.id, typeId))}
            />
          </Panel>
        )
      ) : (
        <StockBuilderView
          rows={rows}
          nameOf={nameOf}
          listName={list.name}
          activeCharacterId={activeCharacterId}
          viewSwitch={viewSwitch}
        />
      )}
      {dialogs}
    </div>
  );
}
