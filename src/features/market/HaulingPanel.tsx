import { useCopyFeedback } from '@/lib/useCopyFeedback';
import { formatAge } from '@/lib/age';
import { HaulingHowItWorks } from './HaulingHowItWorks';
import { formatCount } from '@/lib/formatCount';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  Button,
  Checkbox,
  ColumnPickerMenu,
  DataTable,
  DisabledMenuItem,
  EmptyState,
  FilterBar,
  FilterField,
  IconButton,
  LiveStatus,
  MenuItem,
  Modal,
  Panel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SlideOver,
  Spinner,
  Toast,
  Tooltip,
  type ActiveFilter,
} from '@/components/ui';
import { touchCheckboxLabelClassName } from '@/components/ui/controlStyles';
import { useIsNarrow } from '@/lib/useIsNarrow';
import { formatIskCompact } from '@/lib/isk';
import { useElementNarrowerThan } from '@/lib/useElementNarrowerThan';
import { useIsPhone } from '@/lib/useIsPhone';
import { multibuyText } from '@/engine/market/haulingPlan';
import { writeToClipboard } from '@/lib/clipboard';
import { createLocalSetting } from '@/lib/useLocalSetting';
import { enumParam, intParam, optionalIntParam } from '@/lib/urlState';
import {
  useRememberedUrlParams,
  type RememberedDefaults,
  type UrlParamValues,
} from '@/lib/useUrlState';
import type { TradeHub } from '@/market/hubs';
import { useTurnInOffersByHub } from '@/features/campaigns/useTurnIns';
import { loadMarketGroups } from '@/sde/loadMarketSde';
import type { MarketGroupNode } from '@/sde/marketTypes';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { TableActionsMenu } from '@/components/ui/TableExport';
import * as Icon from '@/components/ui/icons';
import { HaulingCargoControl } from './HaulingCargoControl';
import { HubField, IskCapField, CategorySelect, ModeSelect } from './HaulingFilterFields';
import { useHaulingExport, useHaulingPlanState } from './useHaulingPlanState';
import { useHaulingTable } from './useHaulingTable';
import { HaulingItemActions, HaulingItemDetail } from './HaulingItemDetail';
import { formatTripM3, shownFreeM3 } from './format';
import {
  HaulingFillList,
  HaulingTripBar,
  HaulingTripRail,
  HaulingTripSummary,
} from './HaulingTripRail';
import { useHaulingBudget, useHaulingCargo } from './haulingCargo';
import {
  DEFAULT_HAULING_FILTER,
  useHaulingFilterPref,
  type HaulingDemandFilter,
  type StoredHaulingFilter,
} from './haulingFilterPref';
import {
  EVERYTHING_CATEGORY_ID,
  DEFAULT_HAULING_CATEGORY_ID,
  isHaulingCategoryId,
} from './haulingCategories';
import {
  filterHaulingRows,
  toViewRows,
  type HaulingFilters,
  type HaulingViewRow,
} from './haulingView';
import { useMarketHub } from './hub';
import {
  ANY_HUB,
  anyEndOf,
  expandHaulingLane,
  HAULING_HUB_CHOICES,
  haulingEnd,
  haulingHubDefaults,
  pickHaulingHub,
} from './haulingHubs';
import { rememberHaulingSummary, summarizeHaulingRows } from './haulingSummary';
import { IskDelta } from '@/components/ui/IskDelta';
import { useHaulingFees, useHaulingScan } from './useHaulingScan';
import { useHaulingFill, useHaulingFillOffer } from './useHaulingFill';
import {
  HAUL_MODES,
  MAX_BOOK_CANDIDATES,
  MAX_HISTORY_READS,
  type HaulingProgress,
  type HaulMode,
} from './haulingData';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { TABLE_WIDTHS } from './haulingTableWidths';
import { VIRTUALIZE_THRESHOLD } from '@/components/ui/DataTable';
import { useAsyncLoad } from '@/lib/useAsyncLoad';
const DAY_CHOICES = [7, 14, 30, 0] as const;

const RAIL_REM = 21;
const RAIL_MIN_COLUMN_REM = 24;
const RAIL_GRID = { gridTemplateColumns: 'minmax(0, 1fr) 20rem' } as const;
const MARGIN_CHOICES = [0, 3, 5, 10] as const;

const HAULING_URL_FILTERS = {
  cat: intParam(DEFAULT_HAULING_CATEGORY_ID),
  mode: enumParam(HAUL_MODES, 'list'),
  days: intParam(DEFAULT_HAULING_FILTER.days, { min: 0, max: 365 }),
  margin: intParam(DEFAULT_HAULING_FILTER.margin, { min: 0, max: 100 }),
  demand: enumParam(['steady', 'any'] as const, DEFAULT_HAULING_FILTER.demand),
  maxprice: optionalIntParam({ min: 1 }),
  spend: optionalIntParam({ min: 1 }),
};

function haulingUrl(hubId: TradeHub['id']) {
  const defaults = haulingHubDefaults(hubId);
  return {
    from: enumParam(HAULING_HUB_CHOICES, defaults.from),
    to: enumParam(HAULING_HUB_CHOICES, defaults.to),
    ...HAULING_URL_FILTERS,
  };
}

type HaulingUrlValues = UrlParamValues<ReturnType<typeof haulingUrl>>;

function pickHaulingFilter(source: StoredHaulingFilter): StoredHaulingFilter {
  return {
    days: source.days,
    margin: source.margin,
    demand: source.demand,
    maxprice: source.maxprice,
  };
}

type RememberedHaulingParams = StoredHaulingFilter & { spend: number | null };

function pickRememberedParams(source: RememberedHaulingParams): RememberedHaulingParams {
  return { ...pickHaulingFilter(source), spend: source.spend };
}

type HaulingFilterValue = RememberedHaulingParams & { cat: number; mode: HaulMode };

function activeHaulingFilters(
  value: HaulingFilterValue,
  t: TFunction
): ActiveFilter<HaulingFilterValue>[] {
  const listing = value.mode !== 'instant';
  const active: ActiveFilter<HaulingFilterValue>[] = [];
  if (value.margin !== DEFAULT_HAULING_FILTER.margin)
    active.push({
      label: t('market.hauling.filters.marginOver'),
      value: t('filters.percent', { value: value.margin }),
      clear: (v) => ({ ...v, margin: DEFAULT_HAULING_FILTER.margin }),
    });
  if (value.maxprice !== null)
    active.push({
      label: t('market.hauling.filters.maxPrice'),
      value: t('filters.isk', { amount: formatIskCompact(value.maxprice) }),
      clear: (v) => ({ ...v, maxprice: null }),
    });
  if (value.spend !== null)
    active.push({
      label: t('market.hauling.filters.maxSpend'),
      value: t('filters.isk', { amount: formatIskCompact(value.spend) }),
      clear: (v) => ({ ...v, spend: null }),
    });
  if (listing && value.days !== DEFAULT_HAULING_FILTER.days)
    active.push({
      label: t('market.hauling.filters.sellsWithin'),
      value:
        value.days === 0
          ? t('market.hauling.filters.anyTime')
          : t('market.hauling.filters.days', { count: value.days }),
      clear: (v) => ({ ...v, days: DEFAULT_HAULING_FILTER.days }),
    });
  if (listing && value.demand !== DEFAULT_HAULING_FILTER.demand)
    active.push({
      label: t('market.hauling.filters.demand'),
      value: t(
        value.demand === 'any'
          ? 'market.hauling.filters.anyDemand'
          : 'market.hauling.filters.steady'
      ),
      clear: (v) => ({ ...v, demand: DEFAULT_HAULING_FILTER.demand }),
    });
  return active;
}

function useRememberedHaulingFilter(): RememberedDefaults<ReturnType<typeof haulingUrl>> {
  const filterPref = useHaulingFilterPref((s) => s.value);
  const storedBudget = useHaulingBudget((s) => s.value);
  useHydratedStore(useHaulingFilterPref, useHaulingBudget);
  return useMemo(
    () => ({
      values: pickRememberedParams({
        ...filterPref,
        spend: storedBudget === null ? null : Math.round(storedBudget) || null,
      }),
      remember: ({ spend, ...filter }: Partial<HaulingUrlValues>) => {
        if (spend !== undefined) void useHaulingBudget.getState().setValue(spend);
        if (Object.keys(filter).length === 0) return;
        const { value, setValue } = useHaulingFilterPref.getState();
        void setValue(pickHaulingFilter({ ...value, ...filter }));
      },
    }),
    [filterPref, storedBudget]
  );
}

const useIntroDismissed = createLocalSetting<boolean>({
  key: 'haulingIntroDismissed',
  defaultValue: false,
});

export interface HaulingRefreshInfo {
  refresh: () => void;
  disabled: boolean;
  fetchedAt: number | null;
}

interface HaulingPanelProps {
  onRefreshInfoChange?: (info: HaulingRefreshInfo | null) => void;
}

export function HaulingPanel({ onRefreshInfoChange }: HaulingPanelProps) {
  const { t } = useTranslation();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);

  const defaultHubId = useMarketHub((state) => state.value);
  const defaultHubHydrated = useHydratedStore(useMarketHub);
  const haulingSchema = useMemo(() => haulingUrl(defaultHubId), [defaultHubId]);

  const rememberedFilter = useRememberedHaulingFilter();
  const [params, setParams] = useRememberedUrlParams(haulingSchema, rememberedFilter);
  const maxSpend = params.spend;
  const from = haulingEnd(params.from);
  const to = haulingEnd(params.to);
  const anyEnd = anyEndOf(params);
  const categoryId = isHaulingCategoryId(params.cat) ? params.cat : DEFAULT_HAULING_CATEGORY_ID;
  const mode: HaulMode = params.mode;
  const instant = mode === 'instant';

  const isNarrow = useIsNarrow();
  const isPhone = useIsPhone();
  const widths = TABLE_WIDTHS[anyEnd === null ? 'oneHub' : 'anyHub'];
  const [layoutRef, [layoutNarrow = false]] = useElementNarrowerThan<HTMLDivElement>([
    RAIL_MIN_COLUMN_REM + RAIL_REM,
  ]);
  const railShown = !isPhone && !layoutNarrow;
  const [tableRef, [tableNarrow = false, tableCards = false]] =
    useElementNarrowerThan<HTMLDivElement>([widths.compact, widths.cards]);
  const cards = isPhone || tableCards;
  const compact = isPhone || tableNarrow;

  const groups: MarketGroupNode[] | null = useAsyncLoad(loadMarketGroups).data ?? null;
  const categoryName = useCallback(
    (id: number) =>
      id === EVERYTHING_CATEGORY_ID
        ? t('market.hauling.categoryAll')
        : (groups?.find((g) => g.id === id)?.name ?? t('market.hauling.categoryFallback', { id })),
    [t, groups]
  );

  const cargo = useHaulingCargo((s) => s.value);
  const setCargo = useHaulingCargo((s) => s.setValue);
  const introDismissed = useIntroDismissed((s) => s.value);
  const setIntroDismissed = useIntroDismissed((s) => s.setValue);
  useHydratedStore(useHaulingCargo, useIntroDismissed);
  const cargoSet = cargo !== null && cargo.holds.length > 0;

  const bothAny = params.from === ANY_HUB && params.to === ANY_HUB;
  const sameHub = !bothAny && params.from === params.to;
  const { state, refresh } = useHaulingScan(
    from,
    to,
    categoryId,
    mode,
    defaultHubHydrated && !sameHub && !bothAny,
    params.maxprice
  );
  const fees = useHaulingFees(activeCharacterId);

  const fetchedAt = state.status === 'ready' && !sameHub && !bothAny ? state.scan.fetchedAt : null;
  const refreshDisabled = fetchedAt === null;

  const rowFilters = useMemo<HaulingFilters>(
    () => ({
      maxDays: params.days === 0 ? null : params.days,
      minMarginPct: params.margin,
      steadyOnly: params.demand === 'steady',
      maxUnitPrice: params.maxprice,
    }),
    [params.days, params.margin, params.demand, params.maxprice]
  );
  const viewRows = useMemo(
    () => (state.status === 'ready' ? toViewRows(state.scan.rows, fees.at) : []),
    [state, fees]
  );
  const { shown, hidden } = useMemo(
    () => filterHaulingRows(viewRows, rowFilters),
    [viewRows, rowFilters]
  );

  const scanFetchedAt = state.status === 'ready' ? state.scan.fetchedAt : null;
  useEffect(() => {
    if (scanFetchedAt === null || sameHub || bothAny) return;
    const { shown: usual } = filterHaulingRows(viewRows, {
      maxDays: DEFAULT_HAULING_FILTER.days,
      minMarginPct: DEFAULT_HAULING_FILTER.margin,
      steadyOnly: DEFAULT_HAULING_FILTER.demand === 'steady',
      maxUnitPrice: DEFAULT_HAULING_FILTER.maxprice,
    });
    const summary = summarizeHaulingRows(usual, scanFetchedAt);
    if (summary) rememberHaulingSummary(summary);
  }, [viewRows, scanFetchedAt, sameHub, bothAny]);

  const [selectedTypeId, setSelectedTypeId] = useState<number | null>(null);
  const [howOpen, setHowOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [tripOpen, setTripOpen] = useState(false);
  const [railWas, setRailWas] = useState(railShown);
  if (railWas !== railShown) {
    setRailWas(railShown);
    setDetailOpen(false);
    setTripOpen(false);
  }
  const scanKey = `${params.from}>${params.to}:${categoryId}:${mode}`;
  const [selectionFor, setSelectionFor] = useState(scanKey);
  if (selectionFor !== scanKey) {
    setSelectionFor(scanKey);
    setSelectedTypeId(null);
    setDetailOpen(false);
  }

  const scannedTypeIds = useMemo(
    () =>
      state.status === 'ready'
        ? [...state.scan.rows.map((r) => r.typeId), ...state.scan.examinedTypeIds]
        : [],
    [state]
  );
  const fill = useHaulingFill({
    from,
    to,
    mode,
    laneKey: scanKey,
    feesAt: fees.at,
    filters: rowFilters,
    groups,
    scannedTypeIds,
  });
  const tableRows = useMemo(
    () => (fill.addedRows.length === 0 ? shown : [...shown, ...fill.addedRows]),
    [shown, fill.addedRows]
  );
  const {
    overrides,
    setOverrides,
    tableCandidates,
    planBase,
    plan,
    lineOf,
    suggestedProfitOf,
    patchOverride,
    resetOverrides,
    clearAll,
    allSelected,
  } = useHaulingPlanState({
    holds: cargo?.holds ?? null,
    maxSpend,
    fees,
    tableRows,
    scanKey,
  });
  const resetFill = fill.reset;
  const reload = useCallback(() => {
    refresh();
    const dropped = resetFill();
    if (dropped.size === 0) return;
    setOverrides((current) => new Map([...current].filter(([id]) => !dropped.has(id))));
  }, [refresh, resetFill, setOverrides]);
  useEffect(() => {
    onRefreshInfoChange?.({ refresh: reload, disabled: refreshDisabled, fetchedAt });
    return () => onRefreshInfoChange?.(null);
  }, [onRefreshInfoChange, reload, refreshDisabled, fetchedAt]);

  const freeM3 = shownFreeM3(plan.holds);

  const fillOffered = cargoSet && anyEnd === null && !sameHub && state.status === 'ready';
  const fillOffer = useHaulingFillOffer(fill, {
    offered: fillOffered,
    current: tableCandidates,
    overrides,
    before: plan,
    base: planBase,
    categoryName,
    pin: (lines) =>
      setOverrides((current) => {
        const next = new Map(current);
        for (const line of lines)
          next.set(line.typeId, { selected: true, quantity: line.quantity });
        return next;
      }),
  });

  const selectedCount = plan.totals.items;

  const selectedRow =
    selectedTypeId === null ? undefined : tableRows.find((r) => r.typeId === selectedTypeId);
  if (selectedTypeId !== null && !selectedRow && state.status === 'ready') {
    setSelectedTypeId(null);
    setDetailOpen(false);
  }
  function selectRow(row: HaulingViewRow) {
    if (row.typeId === selectedTypeId) {
      setSelectedTypeId(null);
      setDetailOpen(false);
    } else {
      setSelectedTypeId(row.typeId);
      setDetailOpen(true);
    }
  }

  const { copied: copyFlash, flash: flashCopy } = useCopyFeedback<'copied' | 'failed'>(2000);
  const copyStatus = copyFlash ?? 'idle';
  const listText = multibuyText(plan.lines);
  const [listShown, setShowList] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (copyStatus === 'failed') listRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [copyStatus]);
  async function copyMultibuy() {
    try {
      await writeToClipboard(listText);
      flashCopy('copied');
    } catch {
      setShowList(true);
      setTripOpen(false);
      flashCopy('failed');
    }
  }

  const limitTextOf = (row: HaulingViewRow): string | undefined => {
    const line = lineOf.get(row.typeId);
    if (!line) return undefined;
    const unit = line.volumeM3 > 0 ? `${formatCount(line.volumeM3)} m³ · ` : '';
    const plainHold = plan.holds.length === 1 && plan.holds[0]!.kind === 'general';
    const holdsText =
      !plainHold && line.placements.length > 0
        ? `${t('market.hauling.plan.inHolds', {
            holds: line.placements.map((p) => t(`market.hauling.holds.${p.kind}`)).join(', '),
          })} · `
        : '';
    return `${unit}${holdsText}${t(`market.hauling.limit.${line.limitedBy}`)}`;
  };

  const addedFromOf = useCallback(
    (typeId: number): string | null => {
      const category = fill.addedIds.has(typeId) ? fill.categoryOf?.get(typeId) : undefined;
      return category === undefined ? null : categoryName(category);
    },
    [fill.addedIds, fill.categoryOf, categoryName]
  );
  const tableExport = useHaulingExport({
    mode,
    anyEnd,
    tableRows,
    lineOf,
    overrides,
    addedFromOf,
  });

  const turnIns = useTurnInOffersByHub([
    ...new Set(expandHaulingLane(params.from, params.to).map((lane) => lane.to)),
  ]);
  const turnInOfferFor = (row: HaulingViewRow) =>
    turnIns.data?.get(row.toHub.id)?.offerFor(row.typeId) ?? null;

  const { columnVisibility, hideableColumnsById, availableColumnIds, visibleColumns } =
    useHaulingTable({
      instant,
      anyEnd,
      cards,
      compact,
      windowed: tableRows.length > VIRTUALIZE_THRESHOLD,
      lineOf,
      suggestedProfitOf,
      overrides,
      patchOverride,
      addedFromOf,
      limitTextOf,
      turnInOfferFor,
    });

  const dear = hidden.tooDear + (state.status === 'ready' ? state.scan.overMaxPrice : 0);
  const hiddenCount = dear + (instant ? 0 : hidden.thin + hidden.slow) + hidden.lowMargin;
  const hiddenKeySuffix = dear > 0 ? 'MaxPrice' : '';
  const filterValue: HaulingFilterValue = {
    ...pickRememberedParams(params),
    cat: categoryId,
    mode,
  };

  const laneLabel =
    from !== ANY_HUB && to !== ANY_HUB
      ? t('market.hauling.itemDetail.lane', { from: from.systemName, to: to.systemName })
      : null;

  const progressText = (progress: HaulingProgress | null) =>
    progress === null
      ? t('market.hauling.progress.starting')
      : t(`market.hauling.progress.${progress.stage}`, {
          done: progress.done,
          total: progress.total,
        });
  const copyButton = (size: 'sm' | 'md', className: string) => (
    <Tooltip content={plan.totals.items === 0 ? t('market.hauling.copyMultibuyEmpty') : null}>
      <Button
        variant="primary"
        size={size}
        className={className}
        aria-disabled={plan.totals.items === 0 || undefined}
        onClick={() => void copyMultibuy()}
      >
        {t('market.hauling.copyMultibuy')}
      </Button>
    </Tooltip>
  );
  const tripMenu = (
    <TableActionsMenu name={t('market.hauling.title')} tableExport={tableExport} size="md">
      {overrides.size === 0 ? (
        <DisabledMenuItem reason={t('market.hauling.fillHoldNothing')}>
          {t('market.hauling.fillHold')}
        </DisabledMenuItem>
      ) : (
        <MenuItem onSelect={resetOverrides}>{t('market.hauling.fillHold')}</MenuItem>
      )}
      <MenuItem onSelect={clearAll}>{t('market.hauling.clearAll')}</MenuItem>
      <MenuItem onSelect={() => setShowList((open) => !open)}>
        {t(listShown ? 'market.hauling.hideMultibuyList' : 'market.hauling.showMultibuyList')}
      </MenuItem>
    </TableActionsMenu>
  );
  const tripFooter = (
    <div className="flex flex-col gap-2">
      <p className="flex items-baseline gap-2 text-sm tabular-nums">
        {cargoSet && <b>{t('market.hauling.tripBar.free', { m3: formatTripM3(freeM3) })}</b>}
        <IskDelta amount={plan.totals.profit} decimals={0} className="ml-auto font-semibold" />
      </p>
      <div className="flex items-center gap-2">
        {copyButton('md', 'flex-1 justify-center')}
        {tripMenu}
      </div>
    </div>
  );
  const tripView = (
    <div className="flex flex-col gap-4">
      <HaulingTripSummary
        plan={plan}
        cargoSet={cargoSet}
        laneLabel={laneLabel}
        fromSystemId={from !== ANY_HUB && to !== ANY_HUB ? from.systemId : null}
        toSystemId={from !== ANY_HUB && to !== ANY_HUB ? to.systemId : null}
        cargoControl={
          <HaulingCargoControl
            characterId={activeCharacterId}
            cargo={cargo}
            onCargoChange={(next) => void setCargo(next)}
          />
        }
        cargoValueAfterFill={fillOffer.cargoValueAfterFill}
        freeM3={freeM3}
      />
      {fillOffered && (fill.requested || freeM3 >= 1) && (
        <HaulingFillList
          {...fillOffer.list}
          freeM3={freeM3}
          progressText={
            fill.state.status === 'loading' ? progressText(fill.state.progress) : undefined
          }
        />
      )}
    </div>
  );
  const closeDetail = () => {
    setDetailOpen(false);
    setSelectedTypeId(null);
  };
  const detail = (row: HaulingViewRow, showTitle: boolean, laneActions?: ReactNode) => (
    <HaulingItemDetail
      key={row.typeId}
      row={row}
      line={lineOf.get(row.typeId)}
      loadNote={limitTextOf(row)}
      showTitle={showTitle}
      laneActions={laneActions}
    />
  );

  let content: ReactNode;
  if (bothAny) {
    content = (
      <Panel padded={false}>
        <EmptyState
          title={t('market.hauling.bothAnyTitle')}
          hint={t('market.hauling.bothAnyHint')}
        />
      </Panel>
    );
  } else if (sameHub) {
    content = (
      <Panel padded={false}>
        <EmptyState
          title={t('market.hauling.sameHubTitle')}
          hint={t('market.hauling.sameHubHint')}
        />
      </Panel>
    );
  } else if (state.status === 'loading') {
    content = (
      <Panel padded={false}>
        <div className="flex items-center gap-3 px-3 py-10">
          <LiveStatus>{progressText(state.progress)}</LiveStatus>
          <Spinner label={t('common.loading')} size="sm" />
          <span className="text-sm text-text-dim">{progressText(state.progress)}</span>
        </div>
      </Panel>
    );
  } else if (state.status === 'error') {
    content = (
      <Panel padded={false}>
        <EmptyState
          title={t('market.hauling.errorTitle')}
          hint={t('market.hauling.errorHint')}
          action={<Button onClick={refresh}>{t('market.hauling.retry')}</Button>}
        />
      </Panel>
    );
  } else if (tableRows.length === 0) {
    content = (
      <Panel padded={false}>
        <EmptyState
          title={t('market.hauling.emptyTitle')}
          hint={
            hiddenCount === 0
              ? t('market.hauling.emptyHint', { scanned: state.scan.scanned })
              : instant
                ? t(`market.hauling.emptyHiddenHintInstant${hiddenKeySuffix}`, {
                    scanned: state.scan.scanned,
                    dear,
                    low: hidden.lowMargin,
                  })
                : t(`market.hauling.emptyHiddenHint${hiddenKeySuffix}`, {
                    scanned: state.scan.scanned,
                    dear,
                    thin: hidden.thin,
                    slow: hidden.slow,
                    low: hidden.lowMargin,
                  })
          }
          action={
            <Button size="sm" onClick={() => setParams(DEFAULT_HAULING_FILTER)}>
              {t('common.resetFilters')}
            </Button>
          }
        />
      </Panel>
    );
  } else {
    const table = (
      <Panel padded={false}>
        <div className="flex items-center gap-2 border-b border-line bg-panel-2 px-3 py-1.5 text-xs text-text-dim tabular-nums">
          <label className={touchCheckboxLabelClassName}>
            <Checkbox
              aria-label={t('market.hauling.selectAll')}
              checked={allSelected}
              onChange={(event) => (event.target.checked ? resetOverrides() : clearAll())}
            />
          </label>
          {t('market.hauling.inTrip', { selected: selectedCount, total: tableRows.length })}
          <IconButton
            variant="plain"
            size="sm"
            className="ml-auto"
            icon={<Icon.Info size={Icon.ICON_SIZE.sm} aria-hidden="true" />}
            label={t('market.hauling.how.open')}
            aria-haspopup="dialog"
            onClick={() => setHowOpen(true)}
          />
          <HaulingHowItWorks
            open={howOpen}
            onClose={() => setHowOpen(false)}
            instant={instant}
            scan={state.scan}
          />
        </div>

        {listShown && (
          <div
            ref={listRef}
            className="flex flex-col gap-1 border-b border-line bg-panel-2 px-3 pt-1 pb-3"
          >
            <span className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
              {t('market.hauling.multibuyList')}
            </span>
            <pre
              aria-label={t('market.hauling.multibuyList')}
              className="max-h-32 overflow-auto border border-line-bright bg-bg px-2 py-1.5 text-xs tabular-nums"
            >
              {listText === '' ? t('market.hauling.multibuyEmpty') : listText}
            </pre>
          </div>
        )}

        <div ref={tableRef} className="@container overflow-x-auto">
          <DataTable
            {...tableExport.tableProps}
            label={t('market.hauling.title')}
            columns={visibleColumns}
            rows={tableRows}
            virtualize="auto"
            rowKey={(row) => row.typeId}
            density="compact"
            stackLayout="dense"
            stacked={cards}
            className="dt-dense-tight"
            defaultSort={{ columnId: 'profit', direction: 'desc' }}
            onRowClick={selectRow}
            selectedRowKey={selectedRow ? selectedRow.typeId : null}
          />
        </div>

        <p className="border-t border-line px-3 py-2 text-[0.6875rem] text-text-dim">
          {hiddenCount === 0
            ? t('market.hauling.scannedLine', { count: state.scan.scanned })
            : instant
              ? t(`market.hauling.hiddenLineInstant${hiddenKeySuffix}`, {
                  dear,
                  low: hidden.lowMargin,
                })
              : t(`market.hauling.hiddenLine${hiddenKeySuffix}`, {
                  dear,
                  thin: hidden.thin,
                  slow: hidden.slow,
                  low: hidden.lowMargin,
                })}
          {state.scan.demandSource
            ? ` ${t(`market.hauling.demand${state.scan.demandSource === 'esi' ? 'Fallback' : 'Daily'}Line`)}`
            : ''}
          {state.scan.booksSource === 'snapshot' && state.scan.booksAsOf
            ? ` ${t('market.hauling.booksSnapshotLine', {
                age: formatAge(state.scan.fetchedAt - state.scan.booksAsOf, t),
              })}`
            : ''}
          {state.scan.capped
            ? ` ${
                state.scan.booksSource === 'snapshot'
                  ? t('market.hauling.cappedLineHistory', { reads: MAX_HISTORY_READS })
                  : instant
                    ? t('market.hauling.cappedLineInstant', { books: MAX_BOOK_CANDIDATES })
                    : state.scan.demandSource === 'daily'
                      ? t('market.hauling.cappedLineDaily', {
                          passed: state.scan.demandPassed,
                          books: MAX_BOOK_CANDIDATES,
                        })
                      : t('market.hauling.cappedLine', {
                          reads: MAX_HISTORY_READS,
                          books: MAX_BOOK_CANDIDATES,
                        })
              }`
            : ''}
        </p>
      </Panel>
    );

    content = (
      <div
        className={railShown ? 'grid items-start gap-4' : 'flex flex-col gap-4'}
        style={railShown ? RAIL_GRID : undefined}
      >
        {table}
        {railShown ? (
          <>
            <p aria-live="polite" className="sr-only">
              {detailOpen && selectedRow
                ? t('market.hauling.selectedAnnouncement', { name: selectedRow.name })
                : ''}
            </p>
            <HaulingTripRail
              detail={detailOpen && selectedRow ? detail(selectedRow, true) : null}
              onBack={() => setDetailOpen(false)}
              trip={
                <>
                  {tripView}
                  <p className="mt-4 text-xs text-text-dim">
                    {t('market.hauling.rail.selectHint')}
                  </p>
                </>
              }
              footer={tripFooter}
              detailKey={selectedRow?.typeId}
            />
          </>
        ) : (
          <>
            <HaulingTripBar
              freeM3={cargoSet ? freeM3 : null}
              profit={plan.totals.profit}
              onOpenTrip={() => setTripOpen(true)}
              copyButton={copyButton('sm', 'shrink-0')}
            />
            {isPhone ? (
              <>
                <Modal
                  open={tripOpen}
                  onClose={() => setTripOpen(false)}
                  title={t('market.hauling.rail.title')}
                  placement="sheet-full"
                >
                  <div className="flex flex-col gap-4">
                    {tripView}
                    {tripFooter}
                  </div>
                </Modal>
                <Modal
                  open={detailOpen && selectedRow !== undefined}
                  onClose={closeDetail}
                  title={selectedRow?.name ?? t('market.hauling.title')}
                  titleActions={selectedRow && <HaulingItemActions row={selectedRow} />}
                  placement="sheet-full"
                >
                  {selectedRow && detail(selectedRow, false)}
                </Modal>
              </>
            ) : (
              <>
                <SlideOver
                  open={tripOpen}
                  onClose={() => setTripOpen(false)}
                  title={t('market.hauling.rail.title')}
                >
                  <div className="flex flex-col gap-4">
                    {tripView}
                    {tripFooter}
                  </div>
                </SlideOver>
                <SlideOver
                  open={detailOpen && selectedRow !== undefined}
                  onClose={closeDetail}
                  contentKey={selectedRow?.typeId}
                  title={selectedRow?.name ?? t('market.hauling.title')}
                >
                  {selectedRow &&
                    detail(selectedRow, false, <HaulingItemActions row={selectedRow} />)}
                </SlideOver>
              </>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div ref={layoutRef} className="flex flex-col gap-4">
      <Panel padded={false}>
        <FilterBar
          value={filterValue}
          onChange={(next) => setParams(next)}
          active={activeHaulingFilters(filterValue, t)}
          resultCount={state.status === 'ready' ? tableRows.length : undefined}
          title={t('market.hauling.filters.title')}
          className="px-3 py-2.5"
          rowAlign="end"
          triggerSize="sm"
          search={
            <>
              <HubField
                label={t('market.hauling.from')}
                value={params.from}
                onChange={(id) =>
                  setParams(pickHaulingHub({ from: params.from, to: params.to }, 'from', id))
                }
              />
              <IconButton
                variant="plain"
                size="sm"
                icon={<Icon.SwapEnds size={Icon.ICON_SIZE.sm} aria-hidden="true" />}
                label={t('market.hauling.swapHubs')}
                onClick={() => setParams({ from: params.to, to: params.from })}
              />
              <HubField
                label={t('market.hauling.to')}
                value={params.to}
                onChange={(id) =>
                  setParams(pickHaulingHub({ from: params.from, to: params.to }, 'to', id))
                }
              />
              {!isNarrow && (
                <>
                  <CategorySelect
                    value={categoryId}
                    onChange={(cat) => setParams({ cat })}
                    nameOf={categoryName}
                    inRouteRow
                  />
                  <ModeSelect
                    value={mode}
                    onChange={(next) => setParams({ mode: next })}
                    inRouteRow
                  />
                </>
              )}
            </>
          }
          actions={
            <>
              <ColumnPickerMenu
                available={availableColumnIds}
                visible={columnVisibility.visible}
                columnsById={hideableColumnsById}
                onToggle={columnVisibility.toggle}
                onReset={columnVisibility.reset}
                resetLabel={t('common.resetColumns')}
                buttonLabel={t('common.columnsButton')}
                menuTitle={t('common.columnsMenuTitle')}
                size="sm"
              />
            </>
          }
        >
          {(draft, setDraft) => {
            const draftInstant = draft.mode === 'instant';
            return (
              <>
                {isNarrow && (
                  <>
                    <FilterField captionInline label={t('market.hauling.category')}>
                      <CategorySelect
                        value={draft.cat}
                        onChange={(cat) => setDraft({ ...draft, cat })}
                        nameOf={categoryName}
                      />
                    </FilterField>
                    <FilterField captionInline label={t('market.hauling.mode')}>
                      <ModeSelect
                        value={draft.mode}
                        onChange={(next) => setDraft({ ...draft, mode: next })}
                      />
                    </FilterField>
                  </>
                )}
                {!draftInstant && (
                  <FilterField captionInline label={t('market.hauling.filters.sellsWithin')}>
                    <Select
                      value={String(draft.days)}
                      onValueChange={(v) => setDraft({ ...draft, days: Number(v) })}
                    >
                      <SelectTrigger
                        size="sm"
                        aria-label={t('market.hauling.filters.sellsWithin')}
                        className="w-28"
                        active={draft.days !== DEFAULT_HAULING_FILTER.days}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DAY_CHOICES.map((d) => (
                          <SelectItem key={d} value={String(d)}>
                            {d === 0
                              ? t('market.hauling.filters.anyTime')
                              : t('market.hauling.filters.days', { count: d })}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FilterField>
                )}
                <FilterField captionInline label={t('market.hauling.filters.marginOver')}>
                  <Select
                    value={String(draft.margin)}
                    onValueChange={(v) => setDraft({ ...draft, margin: Number(v) })}
                  >
                    <SelectTrigger
                      size="sm"
                      aria-label={t('market.hauling.filters.marginOver')}
                      className="w-24"
                      active={draft.margin !== DEFAULT_HAULING_FILTER.margin}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MARGIN_CHOICES.map((m) => (
                        <SelectItem key={m} value={String(m)}>
                          {m}%
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FilterField>
                {!draftInstant && (
                  <FilterField captionInline label={t('market.hauling.filters.demand')}>
                    <Select
                      value={draft.demand}
                      onValueChange={(v) =>
                        setDraft({ ...draft, demand: v as HaulingDemandFilter })
                      }
                    >
                      <SelectTrigger
                        size="sm"
                        aria-label={t('market.hauling.filters.demand')}
                        className="w-40"
                        active={draft.demand !== DEFAULT_HAULING_FILTER.demand}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="steady">{t('market.hauling.filters.steady')}</SelectItem>
                        <SelectItem value="any">{t('market.hauling.filters.anyDemand')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </FilterField>
                )}
                <IskCapField
                  label={t('market.hauling.filters.maxPrice')}
                  value={draft.maxprice}
                  onChange={(maxprice) => setDraft({ ...draft, maxprice })}
                />
                <IskCapField
                  label={t('market.hauling.filters.maxSpend')}
                  hint={t('market.hauling.filters.maxSpendHint')}
                  value={draft.spend}
                  onChange={(spend) => setDraft({ ...draft, spend })}
                />
                <p className="text-[0.6875rem] text-text-dim">
                  {draftInstant
                    ? t('market.hauling.feesLineInstant', { accounting: fees.accountingLevel })
                    : t('market.hauling.feesLine', {
                        accounting: fees.accountingLevel,
                        broker: fees.brokerRelationsLevel,
                      })}
                </p>
              </>
            );
          }}
        </FilterBar>
        {isNarrow && (
          <p className="truncate px-3 pb-2 text-[0.6875rem] text-text-dim">
            {categoryName(categoryId)} · {t(`market.hauling.modes.${mode}`)}
          </p>
        )}

        {!introDismissed && !instant && (
          <div className="flex items-start justify-between gap-3 border-t border-accent-dim bg-accent/10 px-3 py-2 text-sm">
            <p>
              <b>{t('market.hauling.introLead')}</b> {t('market.hauling.introBody')}
            </p>
            <Button variant="ghost" size="sm" onClick={() => void setIntroDismissed(true)}>
              {t('market.hauling.introDismiss')}
            </Button>
          </div>
        )}
      </Panel>

      {content}
      {copyStatus === 'copied' && <Toast message={t('market.hauling.copied')} />}
      {copyStatus === 'failed' && <Toast message={t('market.hauling.copyFailed')} tone="danger" />}
    </div>
  );
}
