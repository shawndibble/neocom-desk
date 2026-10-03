/**
 * The Market page's Hauling tab: what is worth buying at one Trade Hub to sell
 * at another, priced at what a hauler can expect to actually get rather than
 * at today's cheapest listing, and sized to a hold.
 *
 * The first view needs nothing from the user: a route and a category are
 * preset and the list works with no ship chosen. Choosing Cargo Space (and,
 * optionally, a budget) adds the hold meter and lets the Trip Plan stop at
 * what fits. The plan is a suggestion — every row starts ticked at a suggested
 * quantity, and unticking or typing a number re-sizes the rest through the
 * same `planTrip` the suggestion came from.
 */
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Checkbox,
  ColumnPickerMenu,
  DataTable,
  DataAgeBadge,
  EmptyState,
  FilterBar,
  FilterField,
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
  IconButton,
  TypeIcon,
  DataTableDenseCell,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { useIsNarrow } from '@/lib/useIsNarrow';
import { useElementNarrowerThan } from '@/lib/useElementNarrowerThan';
import { useIsPhone } from '@/lib/useIsPhone';
import { multibuyText, planTrip, type TripOverride } from '@/engine/market/haulingPlan';
import type { DemandKind, HaulingFlag } from '@/engine/market/haulingMarket';
import { formatIsk, formatIskCompact } from '@/lib/isk';
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
import { loadMarketGroups } from '@/sde/loadMarketSde';
import type { MarketGroupNode } from '@/sde/marketTypes';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { HAULING_THRESHOLDS } from '@/engine/market/haulingMarket';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import { HaulingCargoControl } from './HaulingCargoControl';
import { haulingCsvColumns } from './haulingCsv';
import { HaulingRowDetail } from './HaulingRowDetail';
import { useHaulingBudget, useHaulingCargo } from './haulingCargo';
import {
  DEFAULT_HAULING_FILTER,
  useHaulingFilterPref,
  type HaulingDemandFilter,
  type StoredHaulingFilter,
} from './haulingFilterPref';
import { ItemContextMenu } from './ItemContextMenu';
import { MarketItemLink } from './MarketItemLink';
import {
  DEFAULT_HAULING_CATEGORY_ID,
  HAULING_CATEGORY_IDS,
  isHaulingCategoryId,
} from './haulingCategories';
import {
  filterHaulingRows,
  formatDaysToSell,
  toViewRows,
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
import { useHaulingFees, useHaulingScan } from './useHaulingScan';
import { HAUL_MODES, type HaulMode } from './haulingData';
const DAY_CHOICES = [7, 14, 30, 0] as const;

/**
 * The table widths (rem) the layout changes at, measured in Chrome: below
 * `compact` the figures go compact (`12.08M`; the full ones need about 54rem
 * with "ISK each", which the CSS drops at the same 56rem), and below `cards`
 * the rows become the phone's cards (the compact columns need about 46rem;
 * a rem and more of headroom, so a longer figure never brings the scroll back).
 * Any hub's Hub column needs about 5.3rem more of each.
 */
const TABLE_WIDTHS = {
  oneHub: { compact: 56, cards: 47.5 },
  anyHub: { compact: 60, cards: 53 },
} as const;
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
 */
const HAULING_COLUMN_IDS = ['buy', 'expected', 'margin', 'iskPerM3', 'days', 'bring'] as const;
type HaulingColumnId = (typeof HAULING_COLUMN_IDS)[number];

/** Days to Sell (and the demand it carries) is read for a listing only: an instant sale into buy orders has neither. */
const LISTING_ONLY_COLUMN_IDS: readonly HaulingColumnId[] = ['days'];
const INSTANT_COLUMN_IDS = HAULING_COLUMN_IDS.filter((id) => !LISTING_ONLY_COLUMN_IDS.includes(id));

function isHaulingColumnId(id: string): id is HaulingColumnId {
  return (HAULING_COLUMN_IDS as readonly string[]).includes(id);
}

const useHaulingColumns = createColumnVisibilitySetting<HaulingColumnId>({
  key: 'haulingColumns',
  ids: HAULING_COLUMN_IDS,
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

/** What the page header needs to render Hauling's own reload button beside the page title. */
export interface HaulingRefreshInfo {
  refresh: () => void;
  disabled: boolean;
}

interface HaulingPanelProps {
  /**
   * Reload lives in the page title bar next to "Market", not in this Panel's
   * own header — so the scan state (and the function that re-triggers it)
   * is handed up to whoever renders that title bar. Called on every change,
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
  const from = haulingEnd(params.from);
  const to = haulingEnd(params.to);
  // The end set to Any hub, if one is: the table then says which hub each row uses there.
  const anyEnd = anyEndOf(params);
  const categoryId = isHaulingCategoryId(params.cat) ? params.cat : DEFAULT_HAULING_CATEGORY_ID;
  const mode: HaulMode = params.mode;
  const instant = mode === 'instant';

  const columnVisibility = useColumnVisibility(useHaulingColumns, HAULING_COLUMN_IDS);
  const isNarrow = useIsNarrow();
  // A phone's dense card holds Buy, Sell and ISK/m³ on one ~200px line, so
  // its figures go compact (`3.41K`). Chosen in JS, not by a hidden/shown
  // pair of spans: one DOM at every width (DESIGN.md, DataTable).
  const isPhone = useIsPhone();
  // A narrow desktop table goes compact too: its full figures
  // (`12,080,000.00`) left the Item column no room and scrolled the page
  // sideways. Narrower than even the compact columns (a tablet with the rail
  // open leaves the panel slimmer than a phone), the rows become the
  // phone's cards (`TABLE_WIDTHS`).
  const widths = TABLE_WIDTHS[anyEnd === null ? 'oneHub' : 'anyHub'];
  const [tableRef, [tableNarrow = false, tableCards = false]] =
    useElementNarrowerThan<HTMLDivElement>([widths.compact, widths.cards]);
  // The table's `stacked`, and every cell class that would otherwise follow
  // the viewport (`max-sm:`) picks by it instead (ADR 0017).
  const cards = isPhone || tableCards;
  const isk = (value: number, digits: number) =>
    isPhone || tableNarrow ? formatIskCompact(value) : formatIsk(value, digits);

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
    groups?.find((g) => g.id === id)?.name ?? t('market.hauling.categoryFallback', { id });

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

  const refreshDisabled = state.status !== 'ready';
  useEffect(() => {
    onRefreshInfoChange?.({ refresh, disabled: refreshDisabled });
    return () => onRefreshInfoChange?.(null);
  }, [onRefreshInfoChange, refresh, refreshDisabled]);

  const viewRows = useMemo(
    () => (state.status === 'ready' ? toViewRows(state.scan.rows, fees.at) : []),
    [state, fees]
  );
  const { shown, hidden } = useMemo(
    () =>
      filterHaulingRows(viewRows, {
        maxDays: params.days === 0 ? null : params.days,
        minMarginPct: params.margin,
        steadyOnly: params.demand === 'steady',
      }),
    [viewRows, params.days, params.margin, params.demand]
  );

  // The user's edits belong to one scan: a new route, category or mode starts a fresh plan.
  const [overrides, setOverrides] = useState<ReadonlyMap<number, TripOverride>>(new Map());
  const scanKey = `${params.from}>${params.to}:${categoryId}:${mode}`;
  const [overridesFor, setOverridesFor] = useState(scanKey);
  if (overridesFor !== scanKey) {
    setOverridesFor(scanKey);
    setOverrides(new Map());
  }

  const plan = useMemo(
    () =>
      planTrip({
        candidates: shown.map((r) => r.candidate),
        cargoM3: cargo?.m3 ?? null,
        budgetIsk: budget,
        // Every candidate carries its own destination's fees; this is only the fallback.
        fees: fees.at(TRADE_HUBS[0]!),
        overrides,
      }),
    [shown, cargo, budget, fees, overrides]
  );
  const lineOf = useMemo(() => new Map(plan.lines.map((l) => [l.typeId, l])), [plan]);

  function patchOverride(typeId: number, patch: TripOverride | null) {
    setOverrides((current) => {
      const next = new Map(current);
      if (patch === null) next.delete(typeId);
      else next.set(typeId, { ...current.get(typeId), ...patch });
      return next;
    });
  }

  /** Unticks every shown row: Select all's off state, and the menu's Clear all. */
  const clearAll = () => setOverrides(new Map(shown.map((r) => [r.typeId, { selected: false }])));

  const allSelected =
    shown.length > 0 && shown.every((r) => overrides.get(r.typeId)?.selected !== false);
  const selectedCount = shown.filter((r) => overrides.get(r.typeId)?.selected !== false).length;

  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  useEffect(() => {
    if (copyStatus === 'idle') return;
    const timer = setTimeout(() => setCopyStatus('idle'), 2000);
    return () => clearTimeout(timer);
  }, [copyStatus]);
  const listText = multibuyText(plan.lines);
  // The list itself stays out of the way until asked for (the summary row's
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
      setCopyStatus('failed');
    }
  }

  /** What capped a row's planned quantity ("22 m³ · about a week of sales"), or nothing for a row with no plan line. */
  const limitTextOf = (row: HaulingViewRow): string | undefined => {
    const line = lineOf.get(row.typeId);
    if (!line) return undefined;
    const unit = line.volumeM3 > 0 ? `${Math.round(line.volumeM3).toLocaleString()} m³ · ` : '';
    return `${unit}${t(`market.hauling.limit.${line.limitedBy}`)}`;
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
  const tableExport = useTableExport({ surface: 'hauling', rows: shown, columns: csvColumns });

  // The same menu Appraisal's rows carry — a hauled item is an item like any other.
  function rowContextMenu(row: HaulingViewRow, tr: ReactElement) {
    return (
      <ItemContextMenu typeId={row.typeId} itemName={row.name}>
        {tr}
      </ItemContextMenu>
    );
  }

  // On a phone each row is the dense two-line card: name and margin on top,
  // Buy · Sell · ISK/m³ · days underneath, the tick box and the Bring box
  // pinned to its edges (`stackEdge`). A tap opens the row's detail.
  const columns: DataTableColumn<HaulingViewRow>[] = [
    {
      id: 'select',
      header: '',
      headerClassName: 'w-8',
      className: 'w-8',
      stackEdge: 'start',
      render: (row) => (
        <Checkbox
          aria-label={t('market.hauling.selectRow', { item: row.name })}
          checked={overrides.get(row.typeId)?.selected !== false}
          onChange={(event) => patchOverride(row.typeId, { selected: event.target.checked })}
        />
      ),
    },
    {
      id: 'item',
      header: t('market.hauling.columns.item'),
      headerClassName: 'whitespace-nowrap',
      primary: true,
      // The column that gives way: it takes the table's spare width and its
      // name truncates, rather than the longest name setting the table's
      // minimum and scrolling the page sideways (the card has its own rules).
      // Never below a short name's width, though: past that the table
      // scrolls in its own wrapper instead.
      className: cards ? undefined : 'w-full max-w-0 min-w-28',
      sortValue: (row) => row.name.toLowerCase(),
      render: (row) => (
        <span className="flex min-w-0 items-center gap-2">
          {!cards && <TypeIcon typeId={row.typeId} size={32} className="size-6 shrink-0" />}
          <MarketItemLink
            typeId={row.typeId}
            className="min-w-0 truncate font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {row.name}
          </MarketItemLink>
          {row.flags.length > 0 && (
            <IconButton
              variant="plain"
              tone="warning"
              size="sm"
              openOnTap
              icon={<Icon.Warn size={Icon.ICON_SIZE.sm} />}
              label={t('market.hauling.flagsAria', {
                flags: row.flags.map((flag) => flagLabel[flag].text).join(', '),
              })}
              tooltip={row.flags
                .map((flag) => `${flagLabel[flag].text}: ${flagLabel[flag].tip}`)
                .join(' ')}
            />
          )}
        </span>
      ),
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
            render: (row: HaulingViewRow) => hubAtAnyEnd(row, anyEnd).systemName,
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
      render: (row) => isk(row.buyLadder[0]?.price ?? 0, 2),
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
      render: (row) => isk(row.price, 2),
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
      // The phone card's headline figure, on the title line.
      cardCorner: true,
      cellClassName: (row) =>
        row.marginPct >= HAULING_THRESHOLDS.lowMarginPct ? 'text-success' : 'text-text-dim',
      sortValue: (row) => row.marginPct,
      render: (row) => (
        <span className="font-semibold">
          {signed(row.marginPct, 1)}%
          <span
            className={cx(
              'ml-1.5 hidden text-[0.6875rem] font-normal text-text-dim',
              // `TABLE_WIDTHS`' `compact`, per hub mode: the full figures and
              // this suffix come and go together.
              anyEnd === null ? '@min-[56rem]:inline' : '@min-[60rem]:inline'
            )}
          >
            {t('market.hauling.profitEach', {
              isk: `${row.profitPerUnit >= 0 ? '+' : ''}${formatIsk(row.profitPerUnit, 0)}`,
            })}
          </span>
        </span>
      ),
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
            <span
              aria-hidden="true"
              title={t('market.hauling.demandDays', { count: row.demand.daysWithTrades })}
              className={`size-2 shrink-0 ${DEMAND_MARK[row.demand.demand]}`}
            />
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
            value={overrides.get(row.typeId)?.selected === false ? '' : String(line.quantity)}
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
      (availableColumnIds.includes(column.id) && columnVisibility.isVisible(column.id))
  );

  const heldPct =
    cargo !== null && cargo.m3 > 0 ? Math.min(100, (plan.totals.volumeM3 / cargo.m3) * 100) : null;

  const bindingText =
    plan.binding === 'budget'
      ? t('market.hauling.plan.limitedBudget')
      : plan.binding === 'space'
        ? t('market.hauling.plan.limitedSpace')
        : plan.binding === 'sales'
          ? t('market.hauling.plan.limitedSales')
          : null;

  // Selling into buy orders reads neither days nor demand, so only the margin filter counts there.
  const activeFilterCount =
    (!instant && params.days !== DEFAULT_HAULING_FILTER.days ? 1 : 0) +
    (params.margin !== DEFAULT_HAULING_FILTER.margin ? 1 : 0) +
    (!instant && params.demand !== DEFAULT_HAULING_FILTER.demand ? 1 : 0);
  const hiddenCount = (instant ? 0 : hidden.thin + hidden.slow) + hidden.lowMargin;
  // Category and mode ride along so the narrow sheet can edit them as part of
  // its draft; only days/margin/demand are remembered (`rememberedFilter`).
  const filterValue = { ...pickHaulingFilter(params), cat: categoryId, mode };

  return (
    // No title bar: the Hauling tab right above already names the panel, and
    // its old actions (ship, Copy Multibuy, export) live in the trip summary
    // row now, beside the totals they act on.
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
      <div className="border-b border-line">
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
              {state.status === 'ready' && !isNarrow && (
                <DataAgeBadge date={new Date(state.scan.fetchedAt)} />
              )}
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
      </div>

      {/* The intro explains the Expected Sell Price: an instant sale has none. */}
      {!introDismissed && !instant && (
        <div className="flex items-start justify-between gap-3 border-b border-accent-dim bg-accent/10 px-3 py-2 text-sm">
          <p>
            <b>{t('market.hauling.introLead')}</b> {t('market.hauling.introBody')}
          </p>
          <Button variant="ghost" size="sm" onClick={() => void setIntroDismissed(true)}>
            {t('market.hauling.introDismiss')}
          </Button>
        </div>
      )}

      {bothAny ? (
        <EmptyState
          title={t('market.hauling.bothAnyTitle')}
          hint={t('market.hauling.bothAnyHint')}
        />
      ) : sameHub ? (
        <EmptyState
          title={t('market.hauling.sameHubTitle')}
          hint={t('market.hauling.sameHubHint')}
        />
      ) : state.status === 'loading' ? (
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
      ) : state.status === 'error' ? (
        <EmptyState
          title={t('market.hauling.errorTitle')}
          hint={t('market.hauling.errorHint')}
          action={<Button onClick={refresh}>{t('market.hauling.retry')}</Button>}
        />
      ) : (
        <>
          {shown.length === 0 ? (
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
          ) : (
            <>
              {/* The trip summary: the totals, then the hold meter and the
                  actions that act on the whole plan — the ship, Copy
                  Multibuy, and a menu for the rest. One line on a wide
                  screen; on a phone the meter and actions take a second. */}
              <div className="@container flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-panel-2 px-3 py-2 text-sm tabular-nums">
                <div className="flex items-center gap-x-4">
                  <label className="flex items-center gap-2 text-xs text-text-dim">
                    <Checkbox
                      aria-label={t('market.hauling.selectAll')}
                      checked={allSelected}
                      onChange={(event) =>
                        event.target.checked ? setOverrides(new Map()) : clearAll()
                      }
                    />
                    {t('market.hauling.plan.selectedOf', {
                      selected: selectedCount,
                      total: shown.length,
                    })}
                  </label>
                  <span>
                    <b className={plan.totals.profit > 0 ? 'text-success' : undefined}>
                      {plan.totals.profit > 0 ? '+' : ''}
                      {formatIskCompact(plan.totals.profit)}
                    </b>{' '}
                    <span className="text-text-dim">{t('market.hauling.plan.profitWord')}</span>
                  </span>
                  <span>
                    <b>{formatIskCompact(plan.totals.cost)}</b>{' '}
                    <span className="text-text-dim">{t('market.hauling.plan.spendWord')}</span>
                  </span>
                </div>
                <div className="flex min-w-0 flex-1 basis-full items-center gap-3 @min-[40rem]:basis-auto">
                  {cargo !== null && heldPct !== null ? (
                    <>
                      <div
                        role="img"
                        aria-label={t('market.hauling.plan.holdAria', {
                          used: Math.round(plan.totals.volumeM3).toLocaleString(),
                          total: Math.round(cargo.m3).toLocaleString(),
                        })}
                        className="h-1 min-w-8 flex-1 bg-line @max-[26rem]:hidden @min-[40rem]:max-w-xs"
                      >
                        <div className="h-full bg-accent" style={{ width: `${heldPct}%` }} />
                      </div>
                      {/* The meter's bar goes first in a phone-narrow bar
                          (the words beside it say the same), so the ship
                          button keeps its name.
                          What binds the load prints in a bar 40rem wide and up
                          (the bar's own width, not the viewport's: a tablet
                          with the rail open is as cramped as a phone); below
                          that there is no room, and each row's detail says
                          what capped that row. */}
                      <span className="min-w-0 shrink-0 text-[0.6875rem] text-text-dim">
                        {t('market.hauling.plan.holdUsed', {
                          used: Math.round(plan.totals.volumeM3).toLocaleString(),
                          total: Math.round(cargo.m3).toLocaleString(),
                        })}
                        {bindingText && (
                          <span className="@max-[40rem]:hidden"> · {bindingText}</span>
                        )}
                      </span>
                    </>
                  ) : (
                    // The ship button beside it says the same on a phone.
                    <span className="min-w-0 flex-1 text-[0.6875rem] text-text-dim @max-[40rem]:hidden">
                      {t('market.hauling.cargo.tip')}
                    </span>
                  )}
                  <div className="ml-auto flex min-w-0 items-center gap-2">
                    <HaulingCargoControl
                      characterId={activeCharacterId}
                      cargo={cargo}
                      onCargoChange={(next) => void setCargo(next)}
                      budget={budget}
                      onBudgetChange={(next) => void setBudget(next)}
                    />
                    <Button
                      size="sm"
                      disabled={plan.totals.items === 0}
                      onClick={() => void copyMultibuy()}
                      aria-label={t('market.hauling.copyMultibuy')}
                    >
                      <Icon.CopyToClipboard aria-hidden="true" size={Icon.ICON_SIZE.sm} />
                      <span className="@max-[40rem]:hidden">
                        {t('market.hauling.copyMultibuy')}
                      </span>
                    </Button>
                    <TableActionsMenu name={t('market.hauling.title')} tableExport={tableExport}>
                      <MenuItem
                        disabled={overrides.size === 0}
                        onSelect={() => setOverrides(new Map())}
                      >
                        {t('market.hauling.fillHold')}
                      </MenuItem>
                      <MenuItem onSelect={clearAll}>{t('market.hauling.clearAll')}</MenuItem>
                      <MenuItem onSelect={() => setShowList((open) => !open)}>
                        {t(
                          listShown
                            ? 'market.hauling.hideMultibuyList'
                            : 'market.hauling.showMultibuyList'
                        )}
                      </MenuItem>
                    </TableActionsMenu>
                  </div>
                </div>
              </div>

              {/* The list Copy Multibuy copies, on request — and on its own
                  when the clipboard refused, so it can be copied by hand. */}
              {listShown && (
                <div
                  ref={listRef}
                  className="flex flex-col gap-1 border-b border-line bg-panel-2 px-3 pb-3"
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

              {/* A container, not a viewport, query: the rail's width decides
                  how much room the table has, so the secondary words (profit
                  each, the demand label) drop by the table's own width. Where
                  even the compact table cannot fit (a tablet with the rail
                  open), it scrolls inside this wrapper, never the page. */}
              <div ref={tableRef} className="@container overflow-x-auto">
                <DataTable
                  {...tableExport.tableProps}
                  label={t('market.hauling.title')}
                  columns={visibleColumns}
                  rows={shown}
                  virtualize="auto"
                  rowKey={(row) => row.typeId}
                  density="compact"
                  stackLayout="dense"
                  stacked={cards}
                  className="dt-dense-tight"
                  rowContextMenu={rowContextMenu}
                  rowMoreActions
                  expandableRow={{
                    renderDetail: (row) => (
                      <HaulingRowDetail row={row} loadNote={limitTextOf(row)} />
                    ),
                    hideIcon: true,
                  }}
                  rowClassName={(row) =>
                    overrides.get(row.typeId)?.selected === false ? 'opacity-60' : undefined
                  }
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
              </p>
            </>
          )}
        </>
      )}
      {copyStatus === 'copied' && <Toast message={t('market.hauling.copied')} />}
      {copyStatus === 'failed' && <Toast message={t('market.hauling.copyFailed')} />}
    </Panel>
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
        {HAULING_CATEGORY_IDS.map((id) => (
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
  return (
    <TextInput
      size="sm"
      inputMode="numeric"
      aria-label={label}
      title={title}
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
}
