/**
 * One market's **Stock List**: each **Stock Target** against what the pilot
 * has listed there and what waits in their hangar at the same station, worst
 * first (issue #3521).
 *
 * Two views of one list. Manager reads every Stock Target with its Shortfall
 * and how to close it (list from the hangar, then buy or build the rest);
 * Builder keeps only what is left to source and splits it by whether the
 * active Character holds a blueprint, so an industry pilot sees what to build
 * and can hand the lot to a Build Group.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { SecurityStatus } from '@/components/SecurityStatus';
import {
  Button,
  DataAgeBadge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  FilterChip,
  IconButton,
  LiveStatus,
  Panel,
  SegmentedControl,
  Spinner,
  StatChip,
  StatChips,
  Toast,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { useOpenAfterMenu } from '@/components/ui/useOpenAfterMenu';
import { encodeStockListShare } from '@/engine/stockTargets/stockListShare';
import {
  removeStockList,
  removeStockTarget,
  renameStockList,
  setStockListLocation,
  setStockTarget,
  type StockList,
} from '@/engine/stockTargets/stockLists';
import { STOCK_STATUSES, summarizeStock, type StockStatus } from '@/engine/stockTargets/stockRows';
import { writeToClipboard } from '@/lib/clipboard';
import { formatIskCompact } from '@/lib/isk';
import { useRetryFocus } from '@/lib/useRetryFocus';
import type { TradeHub } from '@/market/hubs';
import { MarketDialog } from './MarketDialog';
import {
  AddStockItemDialog,
  DeleteStockListDialog,
  PasteStockItemsDialog,
  StockListNameDialog,
} from './StockListDialogs';
import { StockBuilderView } from './StockBuilderView';
import { StockManagerTable } from './StockManagerTable';
import {
  loadListedAtMarket,
  loadStockTargetsData,
  type StockTargetsData,
} from './stockTargetsData';

type View = 'manager' | 'builder';
type Dialog = 'rename' | 'change' | 'delete' | 'add' | 'paste' | null;
/** The status chips plus one for items the hangar can restock. */
type Filter = StockStatus | 'ready' | null;

export const STOCK_PATH = '/market/stock';
/** The Stock tab's query param carrying a shared market's code. */
export const SHARE_PARAM = 'list';

export function StockMarketPage({
  list,
  lists,
  hub,
  activeCharacterId,
  showBack,
  onSave,
  onDeleted,
  onNew,
}: {
  list: StockList;
  lists: readonly StockList[];
  hub: TradeHub;
  activeCharacterId: number | null;
  /** "All markets" shows only when there is more than one to go back to. */
  showBack: boolean;
  onSave: (next: StockList[]) => void;
  onDeleted: () => void;
  onNew: () => void;
}) {
  const { t } = useTranslation();
  const [view, setView] = useState<View>('manager');
  const [filter, setFilter] = useState<Filter>(null);
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  // A menu item that opens a dialog hands focus back to the ⋮, not to an unmounted item (§6c).
  const menu = useOpenAfterMenu();

  const [loaded, setLoaded] = useState<{ key: string; data: StockTargetsData } | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  // Re-read whenever the list's contents, its market or the hub change.
  const loadKey = `${list.id}|${JSON.stringify(list.items)}|${list.locationId}|${hub.id}|${refreshKey}`;
  useEffect(() => {
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

  // Last good rows stay up while a refresh after an edit runs, so the table doesn't flash —
  // but never another market's rows.
  const data = loaded?.key.startsWith(`${list.id}|`) ? loaded.data : null;
  const loading = loaded?.key !== loadKey && failedKey !== loadKey;
  const failed = failedKey === loadKey && loaded?.key !== loadKey;
  const summary = useMemo(() => (data ? summarizeStock(data.rows) : null), [data]);
  // Retry unmounts into a spinner: focus waits on the results wrapper instead of the page body.
  const [resultsRef, , holdRetryFocus] = useRetryFocus(
    loading ? 'busy' : failed ? 'failed' : 'ok',
    list.id
  );

  async function addListed() {
    const listed = await loadListedAtMarket(list.locationId).catch(() => []);
    const fresh = listed.filter((item) => !list.items.some((i) => i.typeId === item.typeId));
    if (fresh.length > 0) {
      onSave(
        fresh.reduce(
          (acc, item) => setStockTarget(acc, list.id, item.typeId, item.target),
          [...lists]
        )
      );
    }
    setToast(
      fresh.length > 0
        ? t('stockTargets.list.addedListed', { count: fresh.length })
        : t('stockTargets.list.addedListedNone')
    );
  }

  const dialogs = (
    <>
      {dialog === 'rename' && (
        <StockListNameDialog
          title={t('stockTargets.list.renameTitle')}
          confirmLabel={t('stockTargets.list.rename')}
          initialName={list.name}
          onSubmit={(name) => onSave(renameStockList(lists, list.id, name))}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'change' && (
        <MarketDialog
          mode="change"
          characterId={activeCharacterId}
          initial={{
            locationId: list.locationId,
            placeName: data?.place?.name ?? list.name,
            name: list.name,
          }}
          onSubmit={(choice) =>
            onSave(
              renameStockList(
                setStockListLocation(lists, list.id, choice.locationId),
                list.id,
                choice.name
              )
            )
          }
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'delete' && (
        <DeleteStockListDialog
          name={list.name}
          onConfirm={() => {
            onSave(removeStockList(lists, list.id));
            onDeleted();
          }}
          onClose={() => setDialog(null)}
          returnFocusFallback={() =>
            document.querySelector<HTMLElement>(
              '[data-stock-markets], [data-stock-market-title], [data-stock-new-market]'
            )
          }
        />
      )}
      {dialog === 'add' && (
        <AddStockItemDialog
          listName={list.name}
          onAdd={(typeId, quantity) => onSave(setStockTarget(lists, list.id, typeId, quantity))}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'paste' && (
        <PasteStockItemsDialog
          listName={list.name}
          onAdd={(items) =>
            onSave(
              items.reduce(
                (acc, item) => setStockTarget(acc, list.id, item.typeId, item.quantity),
                [...lists]
              )
            )
          }
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );

  const rows = data?.rows ?? [];
  const groupOf = (typeId: number) => data?.groups.get(typeId);
  const groupNames = [
    ...new Set(rows.map((row) => groupOf(row.typeId)).filter((g): g is string => !!g)),
  ].sort((a, b) => a.localeCompare(b));
  const inGroup = (typeId: number) => groupFilter === null || groupOf(typeId) === groupFilter;
  const matches = (row: (typeof rows)[number], f: Filter) =>
    f === null || (f === 'ready' ? row.fromHangar > 0 : row.status === f);
  const filteredRows = rows.filter((row) => matches(row, filter) && inGroup(row.typeId));
  const countOf = (f: Filter) =>
    rows.filter((row) => matches(row, f) && inGroup(row.typeId)).length;
  const shareUrl = () => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, '');
    return `${window.location.origin}${base}${STOCK_PATH}?${SHARE_PARAM}=${encodeStockListShare(list)}`;
  };
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
  const place = data?.place ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {showBack && (
        <Link
          to={STOCK_PATH}
          className="inline-flex items-center self-start text-xs text-accent hover:underline touch:min-h-11"
        >
          ‹ {t('stockTargets.markets.back')}
        </Link>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 basis-full sm:flex-1 sm:basis-auto">
          <h2
            data-stock-market-title
            tabIndex={-1}
            className="text-lg font-semibold [overflow-wrap:anywhere] focus:outline-none"
          >
            {list.name}
          </h2>
          {place && (
            <p className="flex items-center gap-1 text-xs text-text-dim">
              {t(`stockTargets.place.${place.kind}`)}
              {place.systemName && ` · ${place.systemName}`}
              {place.security !== null && <SecurityStatus security={place.security} />}
            </p>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              icon={<Icon.More />}
              label={t('stockTargets.list.actionsLabel', { name: list.name })}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onCloseAutoFocus={menu.onCloseAutoFocus}>
            <DropdownMenuItem onSelect={() => void addListed()}>
              {t('stockTargets.list.addListed')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => menu.run(onNew)}>
              {t('stockTargets.list.new')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => menu.run(() => setDialog('rename'))}>
              {t('stockTargets.list.renameEllipsis')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => menu.run(() => setDialog('change'))}>
              {t('stockTargets.list.changeEllipsis')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => menu.run(() => setDialog('delete'))}>
              {t('stockTargets.list.deleteEllipsis')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {list.items.length > 0 && (
          <Button
            onClick={() =>
              void writeToClipboard(shareUrl()).then(() => setToast(t('stockTargets.share.copied')))
            }
          >
            {t('stockTargets.share.copy')}
          </Button>
        )}
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
            label={t('stockTargets.summary.ready')}
            value={t('stockTargets.summary.items', { count: summary.readyToList })}
            tooltip={t('stockTargets.summary.readyHint')}
            emphasis
          />
          <StatChip
            label={t('stockTargets.summary.toSource')}
            value={`${formatIskCompact(summary.costToFill)} ISK`}
            tooltip={t('stockTargets.summary.toSourceHint', { hub: hub.name })}
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

      {/* The switch stays mounted in one place across views, so it keeps focus (§7). */}
      <div className="flex flex-wrap items-center gap-2">
        {viewSwitch}
        {view === 'manager' && rows.length > 0 && (
          // A phone keeps the status chips to one row that scrolls sideways (§4b), under the switch.
          <div
            role="group"
            aria-label={t('stockTargets.filterLabel')}
            className="order-last flex basis-full items-center gap-1.5 overflow-x-auto max-sm:pb-1 sm:order-none sm:basis-auto sm:flex-wrap sm:overflow-visible"
          >
            <FilterChip
              label={t('stockTargets.filterAll')}
              count={countOf(null)}
              selected={filter === null}
              onToggle={() => setFilter(null)}
            />
            {STOCK_STATUSES.map((status) => (
              <FilterChip
                key={status}
                label={t(`stockTargets.status.${status}`)}
                count={countOf(status)}
                selected={filter === status}
                onToggle={() => setFilter(filter === status ? null : status)}
              />
            ))}
            <FilterChip
              label={t('stockTargets.filterReady')}
              count={countOf('ready')}
              selected={filter === 'ready'}
              onToggle={() => setFilter(filter === 'ready' ? null : 'ready')}
            />
          </div>
        )}
        {view === 'manager' && groupNames.length > 1 && (
          // Desktop only: on a phone the status chips are the one filter row.
          <div
            role="group"
            aria-label={t('stockTargets.groupFilterLabel')}
            className="hidden flex-wrap items-center gap-1.5 sm:flex"
          >
            {groupNames.map((group) => (
              <FilterChip
                key={group}
                label={group}
                selected={groupFilter === group}
                onToggle={() => setGroupFilter(groupFilter === group ? null : group)}
              />
            ))}
          </div>
        )}
        <span className="flex-1" />
        {view === 'manager' && (
          <Button onClick={() => setDialog('paste')}>{t('stockTargets.add.pasteOpen')}</Button>
        )}
      </div>

      <LiveStatus>
        {failed
          ? t('stockTargets.loadFailedHint')
          : data &&
            [
              t('stockTargets.liveSummary', { out: summary?.out ?? 0, low: summary?.low ?? 0 }),
              data.incompleteCharacters.length > 0 &&
                t('stockTargets.incomplete', { names: data.incompleteCharacters.join(', ') }),
            ]
              .filter(Boolean)
              .join('. ')}
      </LiveStatus>

      <div ref={resultsRef} tabIndex={-1} className="flex flex-col gap-3 focus:outline-none">
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
            action={
              <Button
                onClick={() => {
                  holdRetryFocus();
                  setRefreshKey((k) => k + 1);
                }}
              >
                {t('common.retry')}
              </Button>
            }
          />
        ) : !data ? (
          <Spinner label={t('common.loading')} />
        ) : view === 'manager' ? (
          filteredRows.length === 0 ? (
            <EmptyState
              title={t('stockTargets.filteredEmpty')}
              action={
                <Button
                  onClick={() => {
                    setFilter(null);
                    setGroupFilter(null);
                  }}
                >
                  {t('common.resetFilters')}
                </Button>
              }
            />
          ) : (
            <>
              <Panel padded={false}>
                <StockManagerTable
                  rows={filteredRows}
                  nameOf={nameOf}
                  groupOf={groupOf}
                  onSetTarget={(typeId, target) =>
                    onSave(setStockTarget(lists, list.id, typeId, target))
                  }
                  onRemove={(typeId) => onSave(removeStockTarget(lists, list.id, typeId))}
                />
              </Panel>
              <BarLegend />
            </>
          )
        ) : (
          <StockBuilderView
            rows={rows}
            nameOf={nameOf}
            listName={list.name}
            activeCharacterId={activeCharacterId}
          />
        )}
      </div>
      {dialogs}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}

/** What the bar's two fills mean: the bar itself is hidden from assistive tech, the numbers say it. */
function BarLegend() {
  const { t } = useTranslation();
  return (
    <p aria-hidden="true" className="flex flex-wrap items-center gap-4 text-xs text-text-dim">
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-1.5 w-4 rounded-xs bg-text-dim" />
        {t('stockTargets.table.legendListed')}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="stock-bar-hangar inline-block h-1.5 w-4 rounded-xs border border-line" />
        {t('stockTargets.table.legendHangar')}
      </span>
    </p>
  );
}
