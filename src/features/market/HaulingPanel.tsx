/**
 * The Travel page's Hauling tab (moved from Market, #3526): what is worth
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
 * The Trip Plan lives in a rail beside the table (#3878): its totals, the
 * offer to fill the free space from other categories, and Copy multibuy. A
 * row click selects the row and shows its detail in the rail. Where the
 * panel is too narrow for the rail (by its own width, ADR 0017), a sticky bar
 * carries the trip instead, and the trip and the detail open as sheets.
 */
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Checkbox,
  ColumnPickerMenu,
  DataTable,
  EmptyState,
  FilterBar,
  FilterField,
  Modal,
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
  type DataTableColumn,
} from '@/components/ui';
import { focusRingClassName, touchCheckboxLabelClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { useIsNarrow } from '@/lib/useIsNarrow';
import { useElementNarrowerThan } from '@/lib/useElementNarrowerThan';
import { useIsPhone } from '@/lib/useIsPhone';
import { planFill } from '@/engine/market/haulingFill';
import {
  multibuyText,
  planTrip,
  type TripCandidate,
  type TripOverride,
} from '@/engine/market/haulingPlan';
import type { DemandKind, HaulingFlag } from '@/engine/market/haulingMarket';
import { formatIsk, formatMarketIsk, marketIskDecimals } from '@/lib/isk';
import { writeToClipboard } from '@/lib/clipboard';
import { createColumnVisibilitySetting, useColumnVisibility } from '@/lib/columnVisibility';
import { createLocalSetting } from '@/lib/useLocalSetting';
import { enumParam, intParam } from '@/lib/urlState';
import {
  useRememberedUrlParams,
  type RememberedDefaults,
  type UrlParamValues,
} from '@/lib/useUrlState';
import { TRADE_HUBS, type TradeHub } from '@/market/hubs';
import { loadMarketGroups, loadMarketTypes } from '@/sde/loadMarketSde';
import type { MarketGroupNode } from '@/sde/marketTypes';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { HAULING_THRESHOLDS } from '@/engine/market/haulingMarket';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import { HaulingCargoControl } from './HaulingCargoControl';
import { haulingCsvColumns } from './haulingCsv';
import { HaulingFlagWord } from './HaulingFlagWord';
import { HaulingItemDetail } from './HaulingItemDetail';
import { formatTripM3 } from './format';
import {
  HaulingFillList,
  HaulingTripBar,
  HaulingTripRail,
  HaulingTripSummary,
  type HaulingFillItem,
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
  haulingCategoryByType,
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
import { signedIsk } from './signedIsk';
import { useHaulingFees, useHaulingScan } from './useHaulingScan';
import { useHaulingFillScan } from './useHaulingFillScan';
import { useHubJumps } from './useHubJumps';
import {
  HAUL_MODES,
  MAX_BOOK_CANDIDATES,
  MAX_PRICED_CANDIDATES,
  type HaulMode,
} from './haulingData';
const DAY_CHOICES = [7, 14, 30, 0] as const;

/**
 * The table widths (rem) the layout changes at, estimated from the columns'
 * widest figures beside a 20rem rail: below `compact` the figures go compact
 * (`12.08M`; the full ones, a two-line Item and the Bring box need about
 * 42rem), and below `cards` the rows become the phone's cards (the compact
 * columns need about 32rem). A rem and more of headroom on each, so a longer
 * figure never brings the scroll back. Any hub's Hub column needs about
 * 5.3rem more of each.
 */
const TABLE_WIDTHS = {
  oneHub: { compact: 44, cards: 34 },
  anyHub: { compact: 49.5, cards: 39.5 },
} as const;
/** The rail's 20rem and the 1rem gap beside it: the rail shows only where the table still fits beside it as a table. */
const RAIL_REM = 21;
const RAIL_GRID = { gridTemplateColumns: 'minmax(0, 1fr) 20rem' } as const;
const MARGIN_CHOICES = [0, 3, 5, 10] as const;

const HAULING_URL_FILTERS = {
  cat: intParam(DEFAULT_HAULING_CATEGORY_ID),
  /** How the cargo is sold at the destination. Lives in the URL only — never remembered with the filters. */
  mode: enumParam(HAUL_MODES, 'list'),
  days: intParam(DEFAULT_HAULING_FILTER.days, { min: 0, max: 365 }),
  margin: intParam(DEFAULT_HAULING_FILTER.margin, { min: 0, max: 100 }),
  demand: enumParam(['steady', 'any'] as const, DEFAULT_HAULING_FILTER.demand),
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
 * Lifts `days`/`margin`/`demand` off any wider object that carries them
 * (`params`, the remembered-filter store's value) — the three travel
 * together everywhere this filter is read, so this is the one place that
 * reassembles them rather than each call site picking fields by hand.
 */
function pickHaulingFilter<T extends { days: number; margin: number; demand: HaulingDemandFilter }>(
  source: T
): StoredHaulingFilter {
  return { days: source.days, margin: source.margin, demand: source.demand };
}

const useIntroDismissed = createLocalSetting<boolean>({
  key: 'haulingIntroDismissed',
  defaultValue: false,
});

/**
 * The list's optional (non-identity) columns, for `ColumnPickerMenu`
 * (issue: hauling toolbar redesign). `select`/`item` stay out of `ids` —
 * hiding either loses the row's own identity or the multibuy checkbox.
 * Margin and ISK/m³ start hidden: the margin rides under Profit (#3878).
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
 * A new key for #3878's column set: the old one stored a visible list, and a
 * saved list of the old ids would have hidden Profit and m³, the new
 * headline columns. A pilot's old picks start over from the new defaults.
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

function signed(value: number, fractionDigits: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(fractionDigits)}`;
}

const NO_OVERRIDES: ReadonlyMap<number, TripOverride> = new Map();
const NO_IDS: ReadonlySet<number> = new Set();

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

  // The filter fields (days/margin/demand) are remembered across sessions
  // (issue: hauling toolbar redesign) — a link's own value always wins, and
  // an edit is written to both the URL and this store in the same call. See
  // `haulingFilterPref.ts`.
  const haulingFilterPref = useHaulingFilterPref((s) => s.value);
  const hydrateHaulingFilterPref = useHaulingFilterPref((s) => s.hydrate);
  useEffect(() => {
    void hydrateHaulingFilterPref();
  }, [hydrateHaulingFilterPref]);
  const rememberedFilter: RememberedDefaults<ReturnType<typeof haulingUrl>> = useMemo(
    () => ({
      values: pickHaulingFilter(haulingFilterPref),
      remember: (patch: Partial<HaulingUrlValues>) => {
        const { value, setValue } = useHaulingFilterPref.getState();
        void setValue({
          days: patch.days ?? value.days,
          margin: patch.margin ?? value.margin,
          demand: patch.demand ?? value.demand,
        });
      },
    }),
    [haulingFilterPref]
  );
  const [params, setParams] = useRememberedUrlParams(haulingSchema, rememberedFilter);
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
    widths.cards + RAIL_REM,
  ]);
  const railShown = !isPhone && !layoutNarrow;
  // A narrow table goes compact: its full figures (`12,080,000.00`) left
  // the Item column no room and scrolled the page sideways. Narrower than
  // even the compact columns, the rows become the phone's cards.
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
  const budget = useHaulingBudget((s) => s.value);
  const hydrateBudget = useHaulingBudget((s) => s.hydrate);
  const setBudget = useHaulingBudget((s) => s.setValue);
  const introDismissed = useIntroDismissed((s) => s.value);
  const hydrateIntro = useIntroDismissed((s) => s.hydrate);
  const setIntroDismissed = useIntroDismissed((s) => s.setValue);
  useEffect(() => {
    void hydrateCargo();
    void hydrateBudget();
    void hydrateIntro();
  }, [hydrateCargo, hydrateBudget, hydrateIntro]);
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
  useEffect(() => {
    onRefreshInfoChange?.({ refresh, disabled: refreshDisabled, fetchedAt });
    return () => onRefreshInfoChange?.(null);
  }, [onRefreshInfoChange, refresh, refreshDisabled, fetchedAt]);

  const rowFilters = useMemo<HaulingFilters>(
    () => ({
      maxDays: params.days === 0 ? null : params.days,
      minMarginPct: params.margin,
      steadyOnly: params.demand === 'steady',
    }),
    [params.days, params.margin, params.demand]
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
    });
    const summary = summarizeHaulingRows(usual, scanFetchedAt);
    if (summary) rememberHaulingSummary(summary);
  }, [viewRows, scanFetchedAt, sameHub, bothAny]);

  // The user's edits belong to one scan: a new route, category or mode starts
  // a fresh plan — the fill and the items added from it included.
  const [overrides, setOverrides] = useState<ReadonlyMap<number, TripOverride>>(NO_OVERRIDES);
  const [fillRequested, setFillRequested] = useState(false);
  const [addedIds, setAddedIds] = useState<ReadonlySet<number>>(NO_IDS);
  const [unticked, setUnticked] = useState<ReadonlySet<number>>(NO_IDS);
  const [selectedTypeId, setSelectedTypeId] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [tripOpen, setTripOpen] = useState(false);
  const scanKey = `${params.from}>${params.to}:${categoryId}:${mode}`;
  const [overridesFor, setOverridesFor] = useState(scanKey);
  if (overridesFor !== scanKey) {
    setOverridesFor(scanKey);
    setOverrides(NO_OVERRIDES);
    setFillRequested(false);
    setAddedIds(NO_IDS);
    setUnticked(NO_IDS);
    setSelectedTypeId(null);
    setDetailOpen(false);
  }

  // Fill the free space: on demand only (the scan costs ESI budget), never
  // for Everything (no other category is left), and only once the plan is
  // bound by a Cargo Space.
  const fillOffered = categoryId !== EVERYTHING_CATEGORY_ID && cargoSet && !sameHub && !bothAny;
  const fill = useHaulingFillScan(from, to, categoryId, mode, fillRequested);
  const fillShown = useMemo(
    () =>
      fill.state.status === 'ready'
        ? filterHaulingRows(toViewRows(fill.state.scan.rows, fees.at), rowFilters).shown
        : [],
    [fill.state, fees, rowFilters]
  );
  // Each fill row's Hauling category, for "Fuel Blocks · 9,000 m³". Loaded
  // once a fill is ready: the scan has just read the same file, so it is cached.
  const [categoryByType, setCategoryByType] = useState<ReadonlyMap<number, number> | null>(null);
  const fillReady = fill.state.status === 'ready';
  useEffect(() => {
    if (!fillReady || groups === null || categoryByType !== null) return;
    let cancelled = false;
    void loadMarketTypes()
      .then((types) => {
        if (!cancelled) setCategoryByType(haulingCategoryByType(groups, types));
      })
      .catch(() => {
        // The rows still show; only their category line is empty.
      });
    return () => {
      cancelled = true;
    };
  }, [fillReady, groups, categoryByType]);
  const fillCategoryName = (typeId: number) => {
    const id = categoryByType?.get(typeId);
    return id === undefined ? '' : categoryName(id);
  };

  // The table: the scanned rows, then any the user added from the fill.
  const tableRows = useMemo(() => {
    if (addedIds.size === 0) return shown;
    return [...shown, ...fillShown.filter((r) => addedIds.has(r.typeId))];
  }, [shown, fillShown, addedIds]);
  const tableCandidates = useMemo(() => tableRows.map((r) => r.candidate), [tableRows]);

  const holds = cargo?.holds ?? null;
  // Every candidate carries its own destination's fees; this is only the fallback.
  const fallbackFees = fees.at(TRADE_HUBS[0]!);
  const plan = useMemo(
    () =>
      planTrip({
        candidates: tableCandidates,
        holds,
        budgetIsk: budget,
        fees: fallbackFees,
        overrides,
      }),
    // `fallbackFees` follows `fees`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tableCandidates, holds, budget, fees, overrides]
  );
  const lineOf = useMemo(() => new Map(plan.lines.map((l) => [l.typeId, l])), [plan]);
  // The Profit column sorts by the suggestion, not the edited plan: unticking
  // a row or typing in Bring must not move the row out from under the pointer.
  const suggestedProfitOf = useMemo(() => {
    const suggestion = planTrip({
      candidates: tableCandidates,
      holds,
      budgetIsk: budget,
      fees: fallbackFees,
      overrides: NO_OVERRIDES,
    });
    return new Map(suggestion.lines.map((l) => [l.typeId, l.profit]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableCandidates, holds, budget, fees]);

  /** The room left in every hold: one figure for the summary, the fill offer and the trip bar. */
  const freeM3 = plan.holds.reduce((sum, h) => sum + Math.max(0, h.capacityM3 - h.usedM3), 0);

  // What the fill offers: every other-category row not yet added, sized into
  // the space and ISK the current plan leaves (`planFill` pins the plan).
  const fillExtras = useMemo(
    () => (fillOffered ? fillShown.filter((r) => !addedIds.has(r.typeId)) : []),
    [fillOffered, fillShown, addedIds]
  );
  const fillPlanOf = (extras: readonly TripCandidate[]) =>
    extras.length === 0
      ? null
      : planFill({
          current: tableCandidates,
          overrides,
          extras,
          holds,
          budgetIsk: budget,
          fees: fallbackFees,
        });
  const fillPlan = useMemo(
    () => fillPlanOf(fillExtras.map((r) => r.candidate)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fillExtras, tableCandidates, overrides, holds, budget, fees]
  );
  const fillLines = useMemo(() => fillPlan?.lines ?? [], [fillPlan]);
  // Every offered item starts ticked; the user unticks what they don't want.
  // The ticked ones are sized again on their own, so the Add button's totals
  // are exactly what Add loads (an unticked item frees room for the rest).
  const tickedPlan = useMemo(() => {
    const offered = new Set(fillLines.map((l) => l.typeId));
    return fillPlanOf(
      fillExtras
        .filter((r) => offered.has(r.typeId) && !unticked.has(r.typeId))
        .map((r) => r.candidate)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fillLines, fillExtras, unticked, tableCandidates, overrides, holds, budget, fees]);
  const fillItems: HaulingFillItem[] = fillLines.map((line) => ({
    typeId: line.typeId,
    name: line.name,
    categoryName: fillCategoryName(line.typeId),
    quantity: line.quantity,
    volumeM3: line.volumeM3,
    cost: line.cost,
    profit: line.profit,
  }));
  const ticked = new Set(fillLines.filter((l) => !unticked.has(l.typeId)).map((l) => l.typeId));
  const tickedTotals = {
    count: tickedPlan?.lines.length ?? 0,
    volumeM3: tickedPlan?.added.volumeM3 ?? 0,
    cost: tickedPlan?.added.cost ?? 0,
    profit: tickedPlan?.added.profit ?? 0,
  };
  const holdAfter = tickedPlan
    ? tickedPlan.after.holds.reduce(
        (sum, h) => ({ usedM3: sum.usedM3 + h.usedM3, capacityM3: sum.capacityM3 + h.capacityM3 }),
        { usedM3: 0, capacityM3: 0 }
      )
    : null;

  function findFill() {
    // The hook scans when asked the first time; after that (a retry) it re-scans on `refresh`.
    if (fillRequested) fill.refresh();
    else setFillRequested(true);
  }

  /** Adds the ticked fill lines at the quantities the offer showed, so the plan already shipped stays as it was. */
  function addFill() {
    const lines = tickedPlan?.lines ?? [];
    if (lines.length === 0) return;
    setAddedIds((current) => new Set([...current, ...lines.map((l) => l.typeId)]));
    setOverrides((current) => {
      const next = new Map(current);
      for (const line of lines) next.set(line.typeId, { selected: true, quantity: line.quantity });
      return next;
    });
  }

  function toggleFill(typeId: number, on: boolean) {
    setUnticked((current) => {
      const next = new Set(current);
      if (on) next.delete(typeId);
      else next.add(typeId);
      return next;
    });
  }

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

  const flagLabel = useMemo<Record<HaulingFlag, { text: string; tip: string }>>(
    () => ({
      crowded: {
        text: t('market.hauling.flags.crowded'),
        tip: t('market.hauling.flags.crowdedTip'),
      },
      thin: { text: t('market.hauling.flags.thin'), tip: t('market.hauling.flags.thinTip') },
      outlier: {
        text: t('market.hauling.flags.outlier'),
        tip: t('market.hauling.flags.outlierTip'),
      },
      'low-margin': {
        text: t('market.hauling.flags.lowMargin'),
        tip: t('market.hauling.flags.lowMarginTip'),
      },
    }),
    [t]
  );

  const csvColumns = useMemo(
    () =>
      haulingCsvColumns(t, {
        mode,
        anyEnd,
        flagText: (flag) => flagLabel[flag].text,
        bringFor: (row) => {
          const line = lineOf.get(row.typeId);
          if (!line || overrides.get(row.typeId)?.selected === false) return null;
          return line.quantity;
        },
      }),
    [t, mode, anyEnd, flagLabel, lineOf, overrides]
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
      // The column that gives way: it takes the table's spare width and a
      // long name wraps to a second line, rather than the longest name
      // setting the table's minimum and scrolling the page sideways (the
      // card has its own rules). Never below a short name's width, though:
      // past that the table scrolls in its own wrapper instead.
      className: cards ? undefined : 'w-full max-w-0 min-w-28',
      sortValue: (row) => row.name.toLowerCase(),
      render: (row) => {
        // The name is the row's handle, not a link: the row click is its action (§6c).
        const added = addedIds.has(row.typeId) ? fillCategoryName(row.typeId) : null;
        if (cards) {
          return (
            <span className="flex min-w-0 items-center gap-2">
              <span className={entityLinkClassName('min-w-0 truncate font-medium')}>
                {row.name}
              </span>
              {row.flags.map((flag) => (
                <HaulingFlagWord key={flag} flag={flag} />
              ))}
            </span>
          );
        }
        return (
          <span className="flex min-w-0 items-center gap-2">
            <TypeIcon typeId={row.typeId} size={32} className="size-6 shrink-0" />
            <span className="flex min-w-0 flex-col">
              <span className={entityLinkClassName('min-w-0 font-medium leading-snug break-words')}>
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
        (lineOf.get(row.typeId)?.profit ?? 0) > 0 ? 'text-success' : 'text-text-dim',
      sortValue: (row) => suggestedProfitOf.get(row.typeId) ?? 0,
      render: (row) => {
        const line = lineOf.get(row.typeId);
        const profit =
          !line || line.quantity === 0 ? (
            '—'
          ) : compact ? (
            <>
              {line.profit > 0 ? '+' : ''}
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
              {t('market.hauling.itemDetail.margin', { pct: `${signed(row.marginPct, 1)}%` })}
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
      render: (row) => `${signed(row.marginPct, 1)}%`,
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
      headerTooltip: t('market.hauling.columns.m3Tip'),
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
            value={
              overrides.get(row.typeId)?.selected === false ? '' : line.quantity.toLocaleString()
            }
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

  // Selling into buy orders reads neither days nor demand, so only the margin filter counts there.
  const activeFilterCount =
    (!instant && params.days !== DEFAULT_HAULING_FILTER.days ? 1 : 0) +
    (params.margin !== DEFAULT_HAULING_FILTER.margin ? 1 : 0) +
    (!instant && params.demand !== DEFAULT_HAULING_FILTER.demand ? 1 : 0);
  const hiddenCount = (instant ? 0 : hidden.thin + hidden.slow) + hidden.lowMargin;
  // Category and mode ride along so the narrow sheet can edit them as part of
  // its draft; only days/margin/demand are remembered (`rememberedFilter`).
  const filterValue = { ...pickHaulingFilter(params), cat: categoryId, mode };

  // With Any hub at an end each row has its own lane: no one label, no one jump count.
  const jumps = useHubJumps(
    anyEnd === null && from !== ANY_HUB ? from.systemId : null,
    anyEnd === null && to !== ANY_HUB ? to.systemId : null
  );
  const laneLabel =
    from !== ANY_HUB && to !== ANY_HUB
      ? t('market.hauling.itemDetail.lane', { from: from.systemName, to: to.systemName })
      : null;

  const copyDisabled = plan.totals.items === 0;
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
        <span className={cx('ml-auto font-semibold', plan.totals.profit > 0 && 'text-success')}>
          {signedIsk(plan.totals.profit, 0)}
        </span>
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="primary"
          className="flex-1 justify-center"
          disabled={copyDisabled}
          onClick={() => void copyMultibuy()}
        >
          {t('market.hauling.copyMultibuy')}
        </Button>
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
        jumps={jumps}
        cargoControl={
          <HaulingCargoControl
            characterId={activeCharacterId}
            cargo={cargo}
            onCargoChange={(next) => void setCargo(next)}
            budget={budget}
            onBudgetChange={(next) => void setBudget(next)}
          />
        }
        cargoValueAfterFill={tickedPlan ? tickedPlan.after.totals.cost : null}
        freeM3={freeM3}
      />
      {/* A full hold has nothing to offer until the user asks (or has asked). */}
      {fillOffered && (fillRequested || freeM3 >= 1) && (
        <HaulingFillList
          freeM3={freeM3}
          status={fill.state.status}
          progressText={
            fill.state.status === 'loading'
              ? fill.state.progress === null
                ? t('market.hauling.progress.starting')
                : t(`market.hauling.progress.${fill.state.progress.stage}`, {
                    done: fill.state.progress.done,
                    total: fill.state.progress.total,
                  })
              : undefined
          }
          items={fillItems}
          ticked={ticked}
          onToggle={toggleFill}
          onFind={findFill}
          onAdd={addFill}
          tickedTotals={tickedTotals}
          holdAfter={holdAfter}
        />
      )}
    </div>
  );
  const detail = (row: HaulingViewRow, showTitle: boolean) => (
    <HaulingItemDetail
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
          <span className="text-sm text-text-dim">
            {state.progress === null
              ? t('market.hauling.progress.starting')
              : t(`market.hauling.progress.${state.progress.stage}`, {
                  done: state.progress.done,
                  total: state.progress.total,
                })}
          </span>
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
                ? t('market.hauling.emptyHiddenHintInstant', {
                    scanned: state.scan.scanned,
                    low: hidden.lowMargin,
                  })
                : t('market.hauling.emptyHiddenHint', {
                    scanned: state.scan.scanned,
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
        {/* Select all, and how much of the list the trip holds. */}
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

        {/* The list Copy multibuy list copies, on request — and on its own
            when the clipboard refused, so it can be copied by hand. */}
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
              ? t('market.hauling.hiddenLineInstant', { low: hidden.lowMargin })
              : t('market.hauling.hiddenLine', {
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

    content = railShown ? (
      // The rail is a direct grid child: a wrapper would end its sticky.
      <div className="grid items-start gap-4" style={RAIL_GRID}>
        {table}
        {/* The rail repaints in place; a sheet would announce itself (#1490). */}
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
              <p className="mt-4 text-xs text-text-dim">{t('market.hauling.rail.selectHint')}</p>
            </>
          }
          footer={tripFooter}
          detailKey={selectedRow?.typeId}
        />
      </div>
    ) : (
      <>
        {table}
        <HaulingTripBar
          freeM3={cargoSet ? freeM3 : null}
          profit={plan.totals.profit}
          onOpenTrip={() => setTripOpen(true)}
          copyButton={
            <Button
              variant="primary"
              size="sm"
              className="shrink-0"
              disabled={copyDisabled}
              onClick={() => void copyMultibuy()}
            >
              {t('market.hauling.copyMultibuy')}
            </Button>
          }
        />
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
          // On a phone the selection is only the sheet: closing it clears both.
          onClose={() => {
            setDetailOpen(false);
            setSelectedTypeId(null);
          }}
          title={selectedRow?.name ?? t('market.hauling.title')}
          placement="sheet-full"
        >
          {selectedRow && detail(selectedRow, false)}
        </Modal>
      </>
    );
  }

  return (
    // The route bar spans the panel; the table (and the rail beside it) sit under it.
    <div ref={layoutRef} className="flex flex-col gap-4">
      {/* No title bar: the Hauling tab right above already names the panel. */}
      <Panel padded={false}>
        {/*
          `search` is documented as the route's search box (DESIGN.md §4b) —
          Hauling has none. It carries the From/To/Category controls instead,
          a deliberate deviation: putting them in a sibling row alongside
          `FilterBar` (rather than inside it) was tried first and rejected —
          `FilterBar` manages its own two-line box (trigger row, then the
          opened controls below), so a *shared* flex row reflows the siblings
          when the box opens: `FilterBar` growing taller pushes a sibling row's
          own cross-axis alignment around with it. Nesting these controls in
          `search` avoids that — opening the box only ever adds a second row
          *below* this one inside `FilterBar` itself, never resizing it — at
          the cost of the slot's own contract. No table in this codebase has
          filters with no search box yet; if a second one shows up, that's the
          signal to give `FilterBar` a real "leading toolbar" slot instead of
          overloading `search` a second time.

          The controls carry no caption: the `→` between From and To and each
          select's own value say what they are, and the caption row doubled the
          bar's height. Each keeps its name as its `aria-label`.

          Category and Sell by sit in the row only where it has the width; on a
          narrow screen they move into the filter sheet (same `useIsNarrow`
          breakpoint `FilterBar` itself switches on, so they are never in both
          places or neither), and a one-line summary under the bar keeps the
          choice visible.
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
