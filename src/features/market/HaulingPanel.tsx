/**
 * The Travel page's Hauling tab: what is worth
 * buying at one Trade Hub to sell at another, priced at what a hauler can expect to actually get rather than
 * at today's cheapest listing, and sized to a hold.
 *
 * The first view needs nothing from the user: a route and a category are
 * preset and the list works with no ship chosen. Choosing Cargo Space (and,
 * optionally, a budget) adds the hold meter and lets the Trip Plan stop at
 * what fits. The plan is a suggestion — every row starts ticked at a suggested
 * quantity, and unticking or typing a number re-sizes the rest through the
 * same `planTrip` the suggestion came from.
 *
 * The Trip Plan lives in a rail beside the table: its totals, the
 * offer to fill the free space from other categories, and Copy multibuy. A
 * row click selects the row and shows its detail in the rail. Where the
 * panel is too narrow for the rail (by its own width, ADR 0017), a sticky bar
 * carries the trip instead, and the trip and the detail open as sheets.
 */
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Checkbox,
  ColumnPickerMenu,
  DataTable,
  EmptyState,
  FilterBar,
  FilterField,
  IskInput,
  Modal,
  SlideOver,
  Panel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  MenuItem,
  Spinner,
  TextInput,
  Toast,
  Tooltip,
  IskAmount,
  TypeIcon,
  DataTableDenseCell,
  useFilterSurface,
  type DataTableColumn,
} from '@/components/ui';
import { focusRingClassName, touchCheckboxLabelClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { useIsNarrow } from '@/lib/useIsNarrow';
import { useElementNarrowerThan } from '@/lib/useElementNarrowerThan';
import { useIsPhone } from '@/lib/useIsPhone';
import { multibuyText, planTrip, type TripOverride } from '@/engine/market/haulingPlan';
import type { DemandKind } from '@/engine/market/haulingMarket';
import { formatIsk, formatMarketIsk, marketIskDecimals } from '@/lib/isk';
import { writeToClipboard } from '@/lib/clipboard';
import { createColumnVisibilitySetting, useColumnVisibility } from '@/lib/columnVisibility';
import { createLocalSetting } from '@/lib/useLocalSetting';
import { enumParam, intParam, optionalIntParam } from '@/lib/urlState';
import {
  useRememberedUrlParams,
  type RememberedDefaults,
  type UrlParamValues,
} from '@/lib/useUrlState';
import { TRADE_HUBS, type TradeHub } from '@/market/hubs';
import { loadMarketGroups } from '@/sde/loadMarketSde';
import type { MarketGroupNode } from '@/sde/marketTypes';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { HAULING_THRESHOLDS } from '@/engine/market/haulingMarket';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import { HaulingCargoControl } from './HaulingCargoControl';
import { haulingCsvColumns } from './haulingCsv';
import { HaulingFlagWord } from './HaulingFlagWord';
import { HAULING_FLAG_KEY } from './haulingFlagKeys';
import { HaulingItemActions, HaulingItemDetail } from './HaulingItemDetail';
import { formatSignedPct, formatTripM3, formatVolume } from './format';
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
  HAULING_CATEGORY_OPTIONS,
  isHaulingCategoryId,
} from './haulingCategories';
import {
  filterHaulingRows,
  formatDaysToSell,
  toViewRows,
  type HaulingFilters,
  type HaulingViewRow,
} from './haulingView';
import { useMarketHub } from './hub';
import {
  ANY_HUB,
  anyEndOf,
  HAULING_HUB_CHOICES,
  haulingEnd,
  haulingHubDefaults,
  hubAtAnyEnd,
  pickHaulingHub,
  type HaulingHubChoice,
} from './haulingHubs';
import { rememberHaulingSummary, summarizeHaulingRows } from './haulingSummary';
import { iskGains, signedIsk } from './signedIsk';
import { useHaulingFees, useHaulingScan } from './useHaulingScan';
import { useHaulingFill, useHaulingFillOffer } from './useHaulingFill';
import {
  HAUL_MODES,
  MAX_BOOK_CANDIDATES,
  MAX_PRICED_CANDIDATES,
  type HaulingProgress,
  type HaulMode,
} from './haulingData';
const DAY_CHOICES = [7, 14, 30, 0] as const;

/**
 * Table widths (rem), measured in Chrome: below `compact` figures go compact
 * (full columns ~35.8rem + ~9rem for a two-line Item), below `cards` rows
 * become cards (compact columns ~34.3rem + Item's 7rem floor). Header marks,
 * not figures, set most widths, so the two sit close. Hub adds ~5.3rem.
 */
const TABLE_WIDTHS = {
  oneHub: { compact: 45, cards: 42.5 },
  anyHub: { compact: 50.5, cards: 48 },
} as const;
/** Rail 20rem + 1rem gap. */
const RAIL_REM = 21;
/**
 * Narrowest column left of the rail: a phone's card list (24rem). Beside the
 * rail the table goes compact, then to cards, before the panel falls back to
 * the phone layout (trip bar + sheets) — a laptop keeps the rail.
 */
const RAIL_MIN_COLUMN_REM = 24;
const RAIL_GRID = { gridTemplateColumns: 'minmax(0, 1fr) 20rem' } as const;
const MARGIN_CHOICES = [0, 3, 5, 10] as const;

const HAULING_URL_FILTERS = {
  cat: intParam(DEFAULT_HAULING_CATEGORY_ID),
  /** How the cargo is sold at the destination. Lives in the URL only — never remembered with the filters. */
  mode: enumParam(HAUL_MODES, 'list'),
  days: intParam(DEFAULT_HAULING_FILTER.days, { min: 0, max: 365 }),
  margin: intParam(DEFAULT_HAULING_FILTER.margin, { min: 0, max: 100 }),
  demand: enumParam(['steady', 'any'] as const, DEFAULT_HAULING_FILTER.demand),
  /** Max price per item, whole ISK; absent is no limit. */
  maxprice: optionalIntParam({ min: 1 }),
  /** Max spend: the Trip Plan's ISK budget, whole ISK; absent is no limit. Remembered in `useHaulingBudget`, not with the filters. */
  spend: optionalIntParam({ min: 1 }),
};

/** From/To default to the pilot's Trade Hub (`haulingHubs.ts`), so the schema is built per hub. */
function haulingUrl(hubId: TradeHub['id']) {
  const defaults = haulingHubDefaults(hubId);
  return {
    from: enumParam(HAULING_HUB_CHOICES, defaults.from),
    to: enumParam(HAULING_HUB_CHOICES, defaults.to),
    ...HAULING_URL_FILTERS,
  };
}

type HaulingUrlValues = UrlParamValues<ReturnType<typeof haulingUrl>>;

/**
 * Lifts the remembered filter fields off any wider object that carries them
 * (`params`, a store patch merged over its value) — the one place that
 * reassembles them rather than each call site picking fields by hand.
 */
function pickHaulingFilter(source: StoredHaulingFilter): StoredHaulingFilter {
  return {
    days: source.days,
    margin: source.margin,
    demand: source.demand,
    maxprice: source.maxprice,
  };
}

const useIntroDismissed = createLocalSetting<boolean>({
  key: 'haulingIntroDismissed',
  defaultValue: false,
});

/**
 * The list's optional (non-identity) columns, for `ColumnPickerMenu`
 * (issue: hauling toolbar redesign). `select`/`item` stay out of `ids` —
 * hiding either loses the row's own identity or the multibuy checkbox.
 * Margin and ISK/m³ start hidden: the margin rides under Profit.
 */
const HAULING_COLUMN_IDS = [
  'buy',
  'expected',
  'profit',
  'margin',
  'iskPerM3',
  'm3',
  'days',
  'bring',
] as const;
type HaulingColumnId = (typeof HAULING_COLUMN_IDS)[number];
const DEFAULT_VISIBLE_COLUMN_IDS: readonly HaulingColumnId[] = HAULING_COLUMN_IDS.filter(
  (id) => id !== 'margin' && id !== 'iskPerM3'
);

/** Days to Sell (and the demand it carries) is read for a listing only: an instant sale into buy orders has neither. */
const LISTING_ONLY_COLUMN_IDS: readonly HaulingColumnId[] = ['days'];
const INSTANT_COLUMN_IDS = HAULING_COLUMN_IDS.filter((id) => !LISTING_ONLY_COLUMN_IDS.includes(id));

function isHaulingColumnId(id: string): id is HaulingColumnId {
  return (HAULING_COLUMN_IDS as readonly string[]).includes(id);
}

/**
 * Not `haulingColumns`: that key stored a visible list of the old ids, which
 * would hide Profit and m³. Old picks start over from the new defaults.
 */
const useHaulingColumns = createColumnVisibilitySetting<HaulingColumnId>({
  key: 'haulingTripColumns',
  ids: HAULING_COLUMN_IDS,
  defaultVisible: DEFAULT_VISIBLE_COLUMN_IDS,
});

/**
 * The demand mark: a filled dot, a hollow ring or a square, so the three
 * read apart by shape as well as colour — on a phone the mark stands alone,
 * its words left to screen readers and the row's detail (DESIGN.md §7).
 */
const DEMAND_MARK: Record<DemandKind, string> = {
  'most-days': 'rounded-full bg-success',
  bursts: 'rounded-full border-2 border-warning',
  rarely: 'rounded-[1px] bg-danger',
};

const NO_OVERRIDES: ReadonlyMap<number, TripOverride> = new Map();

/** What the page header needs to render Hauling's reload button and Data Age beside the page title. */
export interface HaulingRefreshInfo {
  refresh: () => void;
  disabled: boolean;
  /** When the shown scan was fetched (epoch ms), or `null` while no scan is ready. */
  fetchedAt: number | null;
}

interface HaulingPanelProps {
  /**
   * Reload and the scan's Data Age live in the page title bar next to
   * "Travel", not in this Panel's own header or filter bar (DESIGN.md §6c:
   * Refresh beside the `DataAgeBadge`) — so the scan state (and the function
   * that re-triggers it) is handed up to whoever renders that title bar. Called on every change,
   * and with `null` on unmount so a stale button never lingers.
   */
  onRefreshInfoChange?: (info: HaulingRefreshInfo | null) => void;
}

export function HaulingPanel({ onRefreshInfoChange }: HaulingPanelProps) {
  const { t } = useTranslation();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);

  const defaultHubId = useMarketHub((state) => state.value);
  const defaultHubHydrated = useMarketHub((state) => state.hydrated);
  const hydrateDefaultHub = useMarketHub((state) => state.hydrate);
  useEffect(() => {
    void hydrateDefaultHub();
  }, [hydrateDefaultHub]);
  const haulingSchema = useMemo(() => haulingUrl(defaultHubId), [defaultHubId]);

  // Remembered: the filters in `haulingFilterPref.ts`, Max spend in the Trip Plan budget's store. A link's own value wins.
  const haulingFilterPref = useHaulingFilterPref((s) => s.value);
  const hydrateHaulingFilterPref = useHaulingFilterPref((s) => s.hydrate);
  const storedBudget = useHaulingBudget((s) => s.value);
  const hydrateBudget = useHaulingBudget((s) => s.hydrate);
  useEffect(() => {
    void hydrateHaulingFilterPref();
    void hydrateBudget();
  }, [hydrateHaulingFilterPref, hydrateBudget]);
  const rememberedFilter: RememberedDefaults<ReturnType<typeof haulingUrl>> = useMemo(
    () => ({
      values: {
        ...pickHaulingFilter(haulingFilterPref),
        // Whole ISK, as the link holds it: the old budget field could save a fraction.
        spend: storedBudget === null ? null : Math.round(storedBudget) || null,
      },
      // Called with only the remembered fields that changed.
      remember: ({ spend, ...filter }: Partial<HaulingUrlValues>) => {
        if (spend !== undefined) void useHaulingBudget.getState().setValue(spend);
        if (Object.keys(filter).length === 0) return;
        const { value, setValue } = useHaulingFilterPref.getState();
        void setValue(pickHaulingFilter({ ...value, ...filter }));
      },
    }),
    [haulingFilterPref, storedBudget]
  );
  const [params, setParams] = useRememberedUrlParams(haulingSchema, rememberedFilter);
  /** Max spend. */
  const budget = params.spend;
  // Stable references (a hub from `TRADE_HUBS`, or the Any string): the scans key their effects on them.
  const from = haulingEnd(params.from);
  const to = haulingEnd(params.to);
  // The end set to Any hub, if one is: the table then says which hub each row uses there.
  const anyEnd = anyEndOf(params);
  const categoryId = isHaulingCategoryId(params.cat) ? params.cat : DEFAULT_HAULING_CATEGORY_ID;
  const mode: HaulMode = params.mode;
  const instant = mode === 'instant';

  const columnVisibility = useColumnVisibility(useHaulingColumns, DEFAULT_VISIBLE_COLUMN_IDS);
  const isNarrow = useIsNarrow();
  // A phone's dense card holds Buy, Sell and the margin on one ~200px line, so
  // its figures go compact (`3.41K`). Chosen in JS, not by a hidden/shown
  // pair of spans: one DOM at every width (DESIGN.md, DataTable).
  const isPhone = useIsPhone();
  const widths = TABLE_WIDTHS[anyEnd === null ? 'oneHub' : 'anyHub'];
  // The rail shows by the panel's own width, not the viewport's (ADR 0017):
  // measured on the whole panel, never on the table beside the rail, whose
  // width the rail itself decides.
  const [layoutRef, [layoutNarrow = false]] = useElementNarrowerThan<HTMLDivElement>([
    RAIL_MIN_COLUMN_REM + RAIL_REM,
  ]);
  const railShown = !isPhone && !layoutNarrow;
  // Narrow table → compact figures (full ones starve Item, scroll page); narrower still → cards.
  const [tableRef, [tableNarrow = false, tableCards = false]] =
    useElementNarrowerThan<HTMLDivElement>([widths.compact, widths.cards]);
  // The table's `stacked`, and every cell class that would otherwise follow
  // the viewport (`max-sm:`) picks by it instead (ADR 0017).
  const cards = isPhone || tableCards;
  const compact = isPhone || tableNarrow;
  const isk = (value: number, digits: number) =>
    compact ? <IskAmount value={value} decimals={digits} /> : formatIsk(value, digits);
  /** A per-unit price: the Market page's cents-below-10,000 rule. */
  const price = (value: number) =>
    compact ? (
      <IskAmount value={value} decimals={marketIskDecimals(value)} />
    ) : (
      formatMarketIsk(value)
    );

  const [groups, setGroups] = useState<MarketGroupNode[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadMarketGroups()
      .then((loaded) => {
        if (!cancelled) setGroups(loaded);
      })
      .catch(() => {
        // Category names fall back to their ids' English names below.
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const categoryName = (id: number) =>
    id === EVERYTHING_CATEGORY_ID
      ? t('market.hauling.categoryAll')
      : (groups?.find((g) => g.id === id)?.name ?? t('market.hauling.categoryFallback', { id }));

  const cargo = useHaulingCargo((s) => s.value);
  const hydrateCargo = useHaulingCargo((s) => s.hydrate);
  const setCargo = useHaulingCargo((s) => s.setValue);
  const introDismissed = useIntroDismissed((s) => s.value);
  const hydrateIntro = useIntroDismissed((s) => s.hydrate);
  const setIntroDismissed = useIntroDismissed((s) => s.setValue);
  useEffect(() => {
    void hydrateCargo();
    void hydrateIntro();
  }, [hydrateCargo, hydrateIntro]);
  const cargoSet = cargo !== null && cargo.holds.length > 0;

  // The pickers never leave Any at both ends (`pickHaulingHub` swaps), but a hand-written link can.
  const bothAny = params.from === ANY_HUB && params.to === ANY_HUB;
  const sameHub = !bothAny && params.from === params.to;
  const { state, refresh } = useHaulingScan(
    from,
    to,
    categoryId,
    mode,
    // Not before the default hub has loaded: until then the lane is the
    // fallback one, and scanning it would spend ESI budget on the wrong route.
    defaultHubHydrated && !sameHub && !bothAny
  );
  const fees = useHaulingFees(activeCharacterId);

  // A disabled scan keeps its last `ready` state, so a same-hub or both-Any
  // lane must not report that stale scan's age (or offer to reload it).
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

  // The Overview's Hauling widget reads this instead of scanning (#3579).
  const scanFetchedAt = state.status === 'ready' ? state.scan.fetchedAt : null;
  useEffect(() => {
    if (scanFetchedAt === null || sameHub || bothAny) return;
    // The default filters, not the pilot's current ones: tightening a filter must not change what the Overview shows for the same scan.
    const { shown: usual } = filterHaulingRows(viewRows, {
      maxDays: DEFAULT_HAULING_FILTER.days,
      minMarginPct: DEFAULT_HAULING_FILTER.margin,
      steadyOnly: DEFAULT_HAULING_FILTER.demand === 'steady',
      maxUnitPrice: DEFAULT_HAULING_FILTER.maxprice,
    });
    const summary = summarizeHaulingRows(usual, scanFetchedAt);
    if (summary) rememberHaulingSummary(summary);
  }, [viewRows, scanFetchedAt, sameHub, bothAny]);

  // The user's edits belong to one scan: a new route, category or mode starts
  // a fresh plan — the fill and the items added from it included.
  const [overrides, setOverrides] = useState<ReadonlyMap<number, TripOverride>>(NO_OVERRIDES);
  const [selectedTypeId, setSelectedTypeId] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [tripOpen, setTripOpen] = useState(false);
  // Crossing the rail's width closes the sheets, so a resize never opens one on its own.
  const [railWas, setRailWas] = useState(railShown);
  if (railWas !== railShown) {
    setRailWas(railShown);
    setDetailOpen(false);
    setTripOpen(false);
  }
  const scanKey = `${params.from}>${params.to}:${categoryId}:${mode}`;
  const [overridesFor, setOverridesFor] = useState(scanKey);
  if (overridesFor !== scanKey) {
    setOverridesFor(scanKey);
    setOverrides(NO_OVERRIDES);
    setSelectedTypeId(null);
    setDetailOpen(false);
  }

  const scannedTypeIds = useMemo(
    () => (state.status === 'ready' ? state.scan.rows.map((r) => r.typeId) : []),
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
  // A reload re-prices the lane: the fill and the rows added from it were
  // priced from the old books, so they go, and with them Add's pins.
  const resetFill = fill.reset;
  const reload = useCallback(() => {
    refresh();
    const dropped = resetFill();
    if (dropped.size === 0) return;
    setOverrides((current) => new Map([...current].filter(([id]) => !dropped.has(id))));
  }, [refresh, resetFill]);
  useEffect(() => {
    onRefreshInfoChange?.({ refresh: reload, disabled: refreshDisabled, fetchedAt });
    return () => onRefreshInfoChange?.(null);
  }, [onRefreshInfoChange, reload, refreshDisabled, fetchedAt]);

  const tableRows = useMemo(
    () => (fill.addedRows.length === 0 ? shown : [...shown, ...fill.addedRows]),
    [shown, fill.addedRows]
  );
  const tableCandidates = useMemo(() => tableRows.map((r) => r.candidate), [tableRows]);

  // Every candidate carries its own destination's fees; `fees` here is only the fallback.
  const planBase = useMemo(
    () => ({ holds: cargo?.holds ?? null, budgetIsk: budget, fees: fees.at(TRADE_HUBS[0]!) }),
    [cargo, budget, fees]
  );
  const plan = useMemo(
    () => planTrip({ ...planBase, candidates: tableCandidates, overrides }),
    [planBase, tableCandidates, overrides]
  );
  const lineOf = useMemo(() => new Map(plan.lines.map((l) => [l.typeId, l])), [plan]);
  // The Profit column sorts by the suggestion, not the edited plan: unticking
  // a row or typing in Bring must not move the row out from under the pointer.
  // Unedited, the suggestion is the plan itself.
  const noEdits = overrides.size === 0;
  const suggestion = useMemo(
    () =>
      noEdits
        ? null
        : planTrip({ ...planBase, candidates: tableCandidates, overrides: NO_OVERRIDES }),
    [noEdits, planBase, tableCandidates]
  );
  const suggestedProfitOf = useMemo(
    () => new Map((suggestion ?? plan).lines.map((l) => [l.typeId, l.profit])),
    [suggestion, plan]
  );

  /** The room left in every hold: one figure for the summary, the fill offer and the trip bar. */
  const freeM3 = plan.holds.reduce((sum, h) => sum + Math.max(0, h.capacityM3 - h.usedM3), 0);

  // Fill the free space: needs a Cargo Space and a fixed lane (Any hub would
  // scan every hub's books), and the category scan landed, so its rows stay out.
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

  function patchOverride(typeId: number, patch: TripOverride | null) {
    setOverrides((current) => {
      const next = new Map(current);
      if (patch === null) next.delete(typeId);
      else next.set(typeId, { ...current.get(typeId), ...patch });
      return next;
    });
  }

  /** Unticks every row: Select all's off state, and the menu's Clear all. */
  const clearAll = () =>
    setOverrides(new Map(tableRows.map((r) => [r.typeId, { selected: false }])));

  const allSelected =
    tableRows.length > 0 && tableRows.every((r) => overrides.get(r.typeId)?.selected !== false);
  const selectedCount = tableRows.filter((r) => overrides.get(r.typeId)?.selected !== false).length;

  // A row click selects the row and shows its detail; a click on the
  // selected row clears it (DESIGN.md §6c). The rail's "‹ Trip" only leaves
  // the detail: the row stays selected.
  const selectedRow =
    selectedTypeId === null ? undefined : tableRows.find((r) => r.typeId === selectedTypeId);
  // A filter or reload that drops the selected row drops the selection, so
  // its detail never springs back open on its own when the row returns.
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

  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  useEffect(() => {
    if (copyStatus === 'idle') return;
    const timer = setTimeout(() => setCopyStatus('idle'), 2000);
    return () => clearTimeout(timer);
  }, [copyStatus]);
  const listText = multibuyText(plan.lines);
  // The list itself stays out of the way until asked for (the trip's
  // menu) — or until the clipboard refuses it, below.
  const [listShown, setShowList] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  // Opened by a refused copy, the list may sit off screen (a phone scrolled
  // down the rows): bring it into view so "copy the list below" points at it.
  useEffect(() => {
    if (copyStatus === 'failed') listRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [copyStatus]);
  async function copyMultibuy() {
    try {
      await writeToClipboard(listText);
      setCopyStatus('copied');
    } catch {
      // Clipboard refused: open the list so it can be copied by hand, and
      // say so rather than leaving the button looking like it did nothing.
      setShowList(true);
      setTripOpen(false);
      setCopyStatus('failed');
    }
  }

  /** What capped a row's planned quantity ("22 m³ · about a week of sales"), or nothing for a row with no plan line. */
  const limitTextOf = (row: HaulingViewRow): string | undefined => {
    const line = lineOf.get(row.typeId);
    if (!line) return undefined;
    const unit = line.volumeM3 > 0 ? `${Math.round(line.volumeM3).toLocaleString()} m³ · ` : '';
    // Unless the Cargo Space is one plain hold, say which the line rides in ("in Ammo hold, Cargo hold").
    const plainHold = plan.holds.length === 1 && plan.holds[0]!.kind === 'general';
    const holdsText =
      !plainHold && line.placements.length > 0
        ? `${t('market.hauling.plan.inHolds', {
            holds: line.placements.map((p) => t(`market.hauling.holds.${p.kind}`)).join(', '),
          })} · `
        : '';
    return `${unit}${holdsText}${t(`market.hauling.limit.${line.limitedBy}`)}`;
  };

  const csvColumns = useMemo(
    () =>
      haulingCsvColumns(t, {
        mode,
        anyEnd,
        flagText: (flag) => t(`market.hauling.flags.${HAULING_FLAG_KEY[flag]}`),
        bringFor: (row) => {
          const line = lineOf.get(row.typeId);
          if (!line || overrides.get(row.typeId)?.selected === false) return null;
          return line.quantity;
        },
      }),
    [t, mode, anyEnd, lineOf, overrides]
  );
  const tableExport = useTableExport({ surface: 'hauling', rows: tableRows, columns: csvColumns });

  const marginVisible = columnVisibility.isVisible('margin');

  // On a phone each row is the dense two-line card: name and profit on top,
  // Buy · Sell · margin · m³ · days underneath, the tick box and the Bring
  // box pinned to its edges (`stackEdge`). A tap opens the row's detail.
  const columns: DataTableColumn<HaulingViewRow>[] = [
    {
      id: 'select',
      header: '',
      headerClassName: 'w-8',
      className: 'w-8',
      stackEdge: 'start',
      // The label is the 44px touch target on a coarse pointer; it grows the cell, never overlays a neighbour.
      render: (row) => (
        <label className={touchCheckboxLabelClassName}>
          <Checkbox
            aria-label={t('market.hauling.selectRow', { item: row.name })}
            checked={overrides.get(row.typeId)?.selected !== false}
            onChange={(event) => patchOverride(row.typeId, { selected: event.target.checked })}
          />
        </label>
      ),
    },
    {
      id: 'item',
      header: t('market.hauling.columns.item'),
      headerClassName: 'whitespace-nowrap',
      primary: true,
      // Takes the spare width and wraps a long name, so the longest name never
      // sets the table's minimum; below `min-w-28` the table scrolls in its wrapper.
      className: cards ? undefined : 'w-full max-w-0 min-w-28',
      sortValue: (row) => row.name.toLowerCase(),
      render: (row) => {
        // The name is the row's handle, not a link: the row click is its action (§6c).
        const addedCategory = fill.addedIds.has(row.typeId)
          ? fill.categoryOf?.get(row.typeId)
          : undefined;
        const added = addedCategory === undefined ? null : categoryName(addedCategory);
        // The name wraps (two lines at most on a card) and the notes go under it, so neither cuts the name.
        const nameAndNotes = (
          <span className="flex min-w-0 flex-col">
            <span
              className={entityLinkClassName(
                cx('min-w-0 font-medium leading-snug break-words', cards && 'line-clamp-2')
              )}
            >
              {row.name}
            </span>
            {(row.flags.length > 0 || added) && (
              <span className="flex flex-wrap gap-x-2 leading-tight">
                {added && (
                  <span className="text-[0.6875rem] text-text-dim">
                    {t('market.hauling.addedFrom', { category: added })}
                  </span>
                )}
                {row.flags.map((flag) => (
                  <HaulingFlagWord key={flag} flag={flag} />
                ))}
              </span>
            )}
          </span>
        );
        if (cards) return nameAndNotes;
        return (
          <span className="flex min-w-0 items-center gap-2">
            <TypeIcon typeId={row.typeId} size={32} className="size-6 shrink-0" />
            {nameAndNotes}
          </span>
        );
      },
    },
    ...(anyEnd === null
      ? []
      : [
          {
            id: 'hub',
            header: t('market.hauling.columns.hub'),
            headerTooltip: t(
              anyEnd === 'from'
                ? 'market.hauling.columns.hubFromTip'
                : 'market.hauling.columns.hubToTip'
            ),
            headerClassName: 'whitespace-nowrap',
            className: 'whitespace-nowrap',
            sortValue: (row: HaulingViewRow) => hubAtAnyEnd(row, anyEnd).systemName,
            render: (row: HaulingViewRow) => {
              const hub = hubAtAnyEnd(row, anyEnd);
              return hub.systemName;
            },
          },
        ]),
    {
      id: 'buy',
      headerClassName: 'whitespace-nowrap',
      header: t('market.hauling.columns.buy'),
      align: 'right',
      className: 'tabular-nums whitespace-nowrap',
      stackAffix: { before: `${t('market.hauling.columns.buy')} ` },
      sortValue: (row) => row.buyLadder[0]?.price,
      render: (row) => price(row.buyLadder[0]?.price ?? 0),
    },
    {
      id: 'expected',
      headerClassName: 'whitespace-nowrap',
      header: t(instant ? 'market.hauling.columns.buyOrder' : 'market.hauling.columns.expected'),
      headerTooltip: t(
        instant ? 'market.hauling.columns.buyOrderTip' : 'market.hauling.columns.expectedTip'
      ),
      align: 'right',
      className: 'tabular-nums whitespace-nowrap',
      stackAffix: {
        before: `${t(instant ? 'market.hauling.columns.buyOrder' : 'market.hauling.columns.expected')} `,
      },
      sortValue: (row) => row.price,
      render: (row) => price(row.price),
    },
    {
      // This trip's profit on the row: what Bring loads of it. The margin
      // rides under it in the table; the card has it on its meta line.
      id: 'profit',
      headerClassName: 'whitespace-nowrap',
      header: t('market.hauling.columns.profit'),
      headerTooltip: t(
        instant ? 'market.hauling.columns.profitInstantTip' : 'market.hauling.columns.profitTip'
      ),
      align: 'right',
      className: 'tabular-nums whitespace-nowrap',
      // The phone card's headline figure, on the title line.
      cardCorner: true,
      cellClassName: (row) =>
        iskGains(lineOf.get(row.typeId)?.profit ?? 0, 0) ? 'text-success' : 'text-text-dim',
      sortValue: (row) => suggestedProfitOf.get(row.typeId) ?? 0,
      render: (row) => {
        const line = lineOf.get(row.typeId);
        const profit =
          !line || line.quantity === 0 ? (
            '—'
          ) : compact ? (
            <>
              {iskGains(line.profit, 0) ? '+' : ''}
              <IskAmount value={line.profit} />
            </>
          ) : (
            signedIsk(line.profit, 0)
          );
        if (cards || marginVisible) return <span className="font-semibold">{profit}</span>;
        return (
          <span className="flex flex-col items-end leading-tight">
            <span className="font-semibold">{profit}</span>
            <span className="text-[0.6875rem] text-text-dim">
              {t('market.hauling.itemDetail.margin', { pct: formatSignedPct(row.marginPct, 1) })}
            </span>
          </span>
        );
      },
    },
    {
      id: 'margin',
      headerClassName: 'whitespace-nowrap',
      header: t('market.hauling.columns.margin'),
      headerTooltip: t(
        instant ? 'market.hauling.columns.marginInstantTip' : 'market.hauling.columns.marginTip'
      ),
      align: 'right',
      className: 'tabular-nums whitespace-nowrap',
      cellClassName: (row) =>
        row.marginPct >= HAULING_THRESHOLDS.lowMarginPct ? 'text-success' : 'text-text-dim',
      sortValue: (row) => row.marginPct,
      render: (row) => formatSignedPct(row.marginPct, 1),
    },
    {
      id: 'iskPerM3',
      headerClassName: 'whitespace-nowrap',
      header: t('market.hauling.columns.iskPerM3'),
      headerTooltip: t('market.hauling.columns.iskPerM3Tip'),
      align: 'right',
      className: 'tabular-nums whitespace-nowrap',
      stackAffix: { after: t('market.hauling.perM3Short') },
      sortValue: (row) => row.iskPerM3,
      render: (row) => isk(row.iskPerM3, 0),
    },
    {
      // The line's hold space: what Bring takes up.
      id: 'm3',
      headerClassName: 'whitespace-nowrap',
      header: t('market.hauling.columns.m3'),
      align: 'right',
      className: 'tabular-nums whitespace-nowrap',
      stackAffix: { after: ` ${t('market.hauling.columns.m3')}` },
      sortValue: (row) => lineOf.get(row.typeId)?.volumeM3 ?? 0,
      render: (row) => formatTripM3(lineOf.get(row.typeId)?.volumeM3 ?? 0),
    },
    {
      // Days to sell and how steadily it sells, in one cell: the demand mark
      // leads, and its words follow in a wide table (a narrower one, and the
      // phone card, keep the mark's shape, with the words for screen readers only).
      id: 'days',
      headerClassName: 'whitespace-nowrap',
      header: t('market.hauling.columns.days'),
      headerTooltip: t('market.hauling.columns.daysTip'),
      className: 'tabular-nums whitespace-nowrap',
      stackAffix: { after: t('market.hauling.daysShort') },
      sortValue: (row) => (row.mode === 'list' ? row.sale.daysToSell : undefined),
      render: (row) =>
        row.mode === 'list' && (
          <DataTableDenseCell>
            <Tooltip content={t('market.hauling.demandDays', { count: row.demand.daysWithTrades })}>
              <span
                tabIndex={0}
                role="img"
                aria-label={t('market.hauling.demandDays', { count: row.demand.daysWithTrades })}
                className={`size-2 shrink-0 ${DEMAND_MARK[row.demand.demand]} ${focusRingClassName}`}
              />
            </Tooltip>
            {formatDaysToSell(row.sale.daysToSell)}
            <span className="text-xs text-text-dim @max-[62rem]:sr-only">
              · {t(`market.hauling.demand.${row.demand.demand}`)}
            </span>
          </DataTableDenseCell>
        ),
    },
    {
      id: 'bring',
      headerClassName: 'whitespace-nowrap',
      header: t('market.hauling.columns.bring'),
      align: 'right',
      className: 'whitespace-nowrap',
      stackEdge: 'end',
      render: (row) => {
        const line = lineOf.get(row.typeId);
        if (!line) return null;
        return (
          <BringInput
            card={cards}
            label={t('market.hauling.bringRow', { item: row.name })}
            title={limitTextOf(row)}
            value={overrides.get(row.typeId)?.selected === false ? '' : formatVolume(line.quantity)}
            onCommit={(quantity) =>
              patchOverride(
                row.typeId,
                quantity === 0
                  ? { selected: false, quantity: undefined }
                  : { selected: true, quantity }
              )
            }
          />
        );
      },
    },
  ];

  // Hideable columns only — `select` and `item` (the row's own identity)
  // are always shown, so they're left out of the picker's catalog entirely.
  const hideableColumnsById = Object.fromEntries(
    columns
      .filter((column): column is DataTableColumn<HaulingViewRow> & { id: HaulingColumnId } =>
        isHaulingColumnId(column.id)
      )
      .map((column) => [column.id, column])
  ) as Record<HaulingColumnId, DataTableColumn<HaulingViewRow>>;
  const availableColumnIds = instant ? INSTANT_COLUMN_IDS : HAULING_COLUMN_IDS;
  const visibleColumns = columns.filter(
    (column) =>
      !isHaulingColumnId(column.id) ||
      (availableColumnIds.includes(column.id) &&
        // The card's meta line carries the margin, picked or not: its Profit has no second line.
        (columnVisibility.isVisible(column.id) || (cards && column.id === 'margin')))
  );

  // Selling into buy orders reads neither days nor demand, so only the
  // margin, max price and max spend count there.
  const activeFilterCount =
    (!instant && params.days !== DEFAULT_HAULING_FILTER.days ? 1 : 0) +
    (params.margin !== DEFAULT_HAULING_FILTER.margin ? 1 : 0) +
    (!instant && params.demand !== DEFAULT_HAULING_FILTER.demand ? 1 : 0) +
    (params.maxprice !== null ? 1 : 0) +
    (params.spend !== null ? 1 : 0);
  const hiddenCount = hidden.tooDear + (instant ? 0 : hidden.thin + hidden.slow) + hidden.lowMargin;
  // Only when Max price hid something does the hidden line name it.
  const hiddenKeySuffix = hidden.tooDear > 0 ? 'MaxPrice' : '';
  // Category and mode ride along so the narrow sheet can edit them as part of
  // its draft; only `rememberedFilter`'s fields are remembered.
  const filterValue = {
    ...pickHaulingFilter(params),
    spend: params.spend,
    cat: categoryId,
    mode,
  };

  // With Any hub at an end each row has its own lane: no one label, no one jump count.
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
    <Button
      variant="primary"
      size={size}
      className={className}
      disabled={plan.totals.items === 0}
      onClick={() => void copyMultibuy()}
    >
      {t('market.hauling.copyMultibuy')}
    </Button>
  );
  const tripMenu = (
    <TableActionsMenu name={t('market.hauling.title')} tableExport={tableExport} size="md">
      <MenuItem disabled={overrides.size === 0} onSelect={() => setOverrides(NO_OVERRIDES)}>
        {t('market.hauling.fillHold')}
      </MenuItem>
      <MenuItem onSelect={clearAll}>{t('market.hauling.clearAll')}</MenuItem>
      <MenuItem onSelect={() => setShowList((open) => !open)}>
        {t(listShown ? 'market.hauling.hideMultibuyList' : 'market.hauling.showMultibuyList')}
      </MenuItem>
    </TableActionsMenu>
  );
  /** Under both rail views and at the foot of the trip sheet: what the trip frees and earns, and what to do with it. */
  const tripFooter = (
    <div className="flex flex-col gap-2">
      <p className="flex items-baseline gap-2 text-sm tabular-nums">
        {cargoSet && <b>{t('market.hauling.tripBar.free', { m3: formatTripM3(freeM3) })}</b>}
        <span
          className={cx('ml-auto font-semibold', iskGains(plan.totals.profit, 0) && 'text-success')}
        >
          {signedIsk(plan.totals.profit, 0)}
        </span>
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
      {/* A full hold has nothing to offer until the user asks (or has asked). */}
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
  // Without the rail the sheet is the selection's only sign: closing it clears both (§6c).
  const closeDetail = () => {
    setDetailOpen(false);
    setSelectedTypeId(null);
  };
  const detail = (row: HaulingViewRow, showTitle: boolean) => (
    // Keyed, so a new row opens with its own folds closed ("Show the math").
    <HaulingItemDetail
      key={row.typeId}
      row={row}
      line={lineOf.get(row.typeId)}
      loadNote={limitTextOf(row)}
      showTitle={showTitle}
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
        <div className="flex items-center gap-3 px-3 py-10" role="status">
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
                    dear: hidden.tooDear,
                    low: hidden.lowMargin,
                  })
                : t(`market.hauling.emptyHiddenHint${hiddenKeySuffix}`, {
                    scanned: state.scan.scanned,
                    dear: hidden.tooDear,
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
              onChange={(event) => (event.target.checked ? setOverrides(NO_OVERRIDES) : clearAll())}
            />
          </label>
          {t('market.hauling.inTrip', { selected: selectedCount, total: tableRows.length })}
        </div>

        {/* The multibuy text, on request, or opened by a refused copy to copy by hand. */}
        {listShown && (
          <div
            ref={listRef}
            className="flex flex-col gap-1 border-b border-line bg-panel-2 px-3 pt-1 pb-3"
          >
            <span className="text-[0.625rem] font-semibold tracking-widest text-text-dim uppercase">
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

        {/* A container, not a viewport, query: the rail decides how much
            room the table has, so the secondary words (the demand label)
            drop by the table's own width. Where even the compact table
            cannot fit, it scrolls inside this wrapper, never the page. */}
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
                  dear: hidden.tooDear,
                  low: hidden.lowMargin,
                })
              : t(`market.hauling.hiddenLine${hiddenKeySuffix}`, {
                  dear: hidden.tooDear,
                  thin: hidden.thin,
                  slow: hidden.slow,
                  low: hidden.lowMargin,
                })}
          {state.scan.capped
            ? ` ${t('market.hauling.cappedLine', {
                priced: MAX_PRICED_CANDIDATES,
                books: MAX_BOOK_CANDIDATES,
              })}`
            : ''}
        </p>
      </Panel>
    );

    content = (
      // One wrapper either way, so crossing the rail's width never remounts
      // the table (its sort, its scroll). The rail is a direct grid child: a
      // wrapper would end its sticky.
      <div
        className={railShown ? 'grid items-start gap-4' : 'flex flex-col gap-4'}
        style={railShown ? RAIL_GRID : undefined}
      >
        {table}
        {railShown ? (
          <>
            {/* The rail repaints in place; a sheet would announce itself. */}
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
              // Too narrow for the rail but not a phone: the same views slide in over the right edge (§6c drawer).
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
                  title={selectedRow?.name ?? t('market.hauling.title')}
                >
                  {selectedRow && (
                    <div className="flex flex-col gap-2">
                      <div className="flex justify-end">
                        <HaulingItemActions row={selectedRow} />
                      </div>
                      {detail(selectedRow, false)}
                    </div>
                  )}
                </SlideOver>
              </>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    // The route bar spans the panel; the table (and the rail beside it) sit under it.
    <div ref={layoutRef} className="flex flex-col gap-4">
      {/* No title bar: the Hauling tab right above already names the panel. */}
      <Panel padded={false}>
        {/*
          Route controls ride in `search` (no search box here; DESIGN.md §4b): a sibling row
          would reflow when FilterBar opens. Uncaptioned, `aria-label` names each. Category
          and Sell by move into the filter sheet below `useIsNarrow` (FilterBar's own
          breakpoint), with a one-line summary under the bar.
        */}
        <FilterBar
          value={filterValue}
          onChange={(next) => setParams(next)}
          activeCount={activeFilterCount}
          title={t('market.hauling.filters.title')}
          className="px-3 py-2.5"
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
              <span aria-hidden="true" className="text-text-faint">
                →
              </span>
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
                  />
                  <ModeSelect value={mode} onChange={(next) => setParams({ mode: next })} />
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
            // Read off the draft, not the committed mode: switching to
            // instant in the sheet drops the listing-only fields before Apply.
            const draftInstant = draft.mode === 'instant';
            return (
              <>
                {isNarrow && (
                  <>
                    <FilterField label={t('market.hauling.category')}>
                      <CategorySelect
                        value={draft.cat}
                        onChange={(cat) => setDraft({ ...draft, cat })}
                        nameOf={categoryName}
                      />
                    </FilterField>
                    <FilterField label={t('market.hauling.mode')}>
                      <ModeSelect
                        value={draft.mode}
                        onChange={(next) => setDraft({ ...draft, mode: next })}
                      />
                    </FilterField>
                  </>
                )}
                {!draftInstant && (
                  <FilterField label={t('market.hauling.filters.sellsWithin')}>
                    <Select
                      value={String(draft.days)}
                      onValueChange={(v) => setDraft({ ...draft, days: Number(v) })}
                    >
                      <SelectTrigger
                        size="sm"
                        aria-label={t('market.hauling.filters.sellsWithin')}
                        className="w-28"
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
                <FilterField label={t('market.hauling.filters.marginOver')}>
                  <Select
                    value={String(draft.margin)}
                    onValueChange={(v) => setDraft({ ...draft, margin: Number(v) })}
                  >
                    <SelectTrigger
                      size="sm"
                      aria-label={t('market.hauling.filters.marginOver')}
                      className="w-24"
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
                  <FilterField label={t('market.hauling.filters.demand')}>
                    <Select
                      value={draft.demand}
                      onValueChange={(v) =>
                        setDraft({ ...draft, demand: v as HaulingDemandFilter })
                      }
                    >
                      <SelectTrigger
                        size="sm"
                        aria-label={t('market.hauling.filters.demand')}
                        className="w-32"
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

        {/* The intro explains the Expected Sell Price: an instant sale has none. */}
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
      {copyStatus === 'failed' && <Toast message={t('market.hauling.copyFailed')} />}
    </div>
  );
}

/** A hub picker. Uncaptioned: the `→` between From and To says which is which; the name is its `aria-label`. */
function HubField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: HaulingHubChoice;
  onChange: (id: HaulingHubChoice) => void;
}) {
  const { t } = useTranslation();
  return (
    <Select value={value} onValueChange={(next) => onChange(next as HaulingHubChoice)}>
      <SelectTrigger size="sm" aria-label={label} className="w-24 sm:w-32">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {TRADE_HUBS.map((h) => (
          <SelectItem key={h.id} value={h.id}>
            {h.systemName}
          </SelectItem>
        ))}
        <SelectItem value={ANY_HUB}>{t('market.hauling.anyHub')}</SelectItem>
      </SelectContent>
    </Select>
  );
}

/**
 * An ISK cap in the filters — Max price per item, Max spend. Blank is no
 * limit. Only a whole, positive figure commits: the URL holds whole ISK.
 * Inline it commits on blur or Enter, not per keystroke: `250m` passes
 * through 2 ISK, which would hide every row and drop the selection. The
 * sheet's draft takes each keystroke; its Apply is the commit.
 */
function IskCapField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number | null;
  onChange: (next: number | null) => void;
}) {
  const { t } = useTranslation();
  const hintId = useId();
  // Inline the field has no caption, so its placeholder names it; in the sheet the caption does.
  const inSheet = useFilterSurface() === 'sheet';
  // What `IskInput` last committed, unrounded, handed back as its `value`: a
  // rounded figure (`2.01m` = 2009999.99… → 2010000) would read as an outside
  // change and reset the typed text. Only a value this field did not send
  // (Reset, a link) replaces it. The URL lands in a transition, so `value` lags.
  const [raw, setRaw] = useState<string | null>(null);
  const [sent, setSent] = useState<number | null>(value);
  const [seen, setSeen] = useState(value);
  // The typed figure not yet committed inline; undefined when there is none.
  const [pending, setPending] = useState<number | null | undefined>(undefined);
  if (seen !== value) {
    setSeen(value);
    if (value !== sent) {
      setRaw(null);
      setPending(undefined);
    }
  }
  const shown = raw ?? (value === null ? '' : String(value));
  function commit(next: number | null) {
    setPending(undefined);
    if (next === value) return;
    setSent(next);
    onChange(next);
  }
  return (
    <FilterField label={label}>
      <IskInput
        size="sm"
        aria-label={label}
        aria-describedby={hint === undefined ? undefined : hintId}
        placeholder={inSheet ? t('market.hauling.filters.noLimit') : label}
        className="w-40"
        value={shown}
        onChange={(text) => {
          setRaw(text);
          const amount = Number(text);
          const whole = text === '' ? null : Math.round(amount);
          // Shorthand's float noise rounds away; a real fraction (`1.5`, on its way to `1.5b`) waits.
          const usable =
            whole === null ||
            (Math.abs(amount - whole) < 0.001 && Number.isSafeInteger(whole) && whole > 0);
          if (!usable) setPending(undefined);
          else if (inSheet) commit(whole);
          else setPending(whole);
        }}
        onBlur={() => {
          if (pending !== undefined) commit(pending);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && pending !== undefined) commit(pending);
        }}
      />
      {hint !== undefined && (
        <span id={hintId} className={inSheet ? 'text-[0.6875rem] text-text-dim' : 'sr-only'}>
          {hint}
        </span>
      )}
    </FilterField>
  );
}

/** The market category to scan — in the route row on a wide screen, in the filter sheet on a narrow one. */
function CategorySelect({
  value,
  onChange,
  nameOf,
}: {
  value: number;
  onChange: (cat: number) => void;
  nameOf: (id: number) => string;
}) {
  const { t } = useTranslation();
  return (
    <Select value={String(value)} onValueChange={(next) => onChange(Number(next))}>
      <SelectTrigger size="sm" aria-label={t('market.hauling.category')} className="w-52">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {HAULING_CATEGORY_OPTIONS.map((id) => (
          <SelectItem key={id} value={String(id)}>
            {nameOf(id)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** How the load is sold at the destination — placed like `CategorySelect`. */
function ModeSelect({ value, onChange }: { value: HaulMode; onChange: (mode: HaulMode) => void }) {
  const { t } = useTranslation();
  return (
    <Select value={value} onValueChange={(next) => onChange(next as HaulMode)}>
      <SelectTrigger size="sm" aria-label={t('market.hauling.mode')} className="w-48">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {HAUL_MODES.map((m) => (
          <SelectItem key={m} value={m}>
            {t(`market.hauling.modes.${m}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * The quantity to bring, typed by hand. Keeps what is being typed in its own
 * state so the box can be emptied and retyped: the planned quantity it would
 * otherwise echo back is clamped and re-sized on every keystroke. Emptying it
 * or typing 0 unticks the row. `title` says what capped the suggestion (the
 * row's detail says it too, for touch).
 */
function BringInput({
  card,
  label,
  title,
  value,
  onCommit,
}: {
  /** On the dense card rather than in a table row. */
  card: boolean;
  label: string;
  title?: string;
  value: string;
  onCommit: (quantity: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const input = (
    <TextInput
      size="sm"
      inputMode="numeric"
      aria-label={label}
      // Shorter and narrower on the card: its height sets the meta line's,
      // and a 360px card still fits it beside that line. 28px is under the
      // touch tier's 36px on purpose (DESIGN.md §3); `max-md:` because the
      // `sm` field is already 28px from `md` up.
      className={cx('text-right tabular-nums', card ? 'w-16 max-md:h-7' : 'w-20')}
      value={draft ?? value}
      onChange={(event) => {
        const raw = event.target.value.replace(/[^\d]/g, '');
        setDraft(raw);
        onCommit(raw === '' ? 0 : Number(raw));
      }}
      onBlur={() => setDraft(null)}
    />
  );
  return title ? <Tooltip content={title}>{input}</Tooltip> : input;
}
