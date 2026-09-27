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
import { useEffect, useMemo, useState, type ReactElement } from 'react';
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
  IconButton,
  Panel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  StatChip,
  TextInput,
  Toast,
  TypeIcon,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import {
  multibuyText,
  planTrip,
  type TripLine,
  type TripOverride,
} from '@/engine/market/haulingPlan';
import type { HaulingFlag } from '@/engine/market/haulingMarket';
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
import { HaulingCargoControl } from './HaulingCargoControl';
import { HaulingRowDetail } from './HaulingRowDetail';
import { useHaulingBudget, useHaulingCargo } from './haulingCargo';
import { DEFAULT_HAULING_FILTER, useHaulingFilterPref } from './haulingFilterPref';
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
import { haulingHubDefaults, pickHaulingHub } from './haulingHubs';
import { useHaulingFees, useHaulingScan } from './useHaulingScan';

const HUB_IDS = TRADE_HUBS.map((h) => h.id);
const DAY_CHOICES = [7, 14, 30, 0] as const;
const MARGIN_CHOICES = [0, 3, 5, 10] as const;

const HAULING_URL_FILTERS = {
  cat: intParam(DEFAULT_HAULING_CATEGORY_ID),
  days: intParam(DEFAULT_HAULING_FILTER.days, { min: 0, max: 365 }),
  margin: intParam(DEFAULT_HAULING_FILTER.margin, { min: 0, max: 100 }),
  demand: enumParam(['steady', 'any'] as const, DEFAULT_HAULING_FILTER.demand),
};

/** From/To default to the pilot's Trade Hub (`haulingHubs.ts`), so the schema is built per hub. */
function haulingUrl(hubId: TradeHub['id']) {
  const defaults = haulingHubDefaults(hubId);
  return {
    from: enumParam(HUB_IDS, defaults.from),
    to: enumParam(HUB_IDS, defaults.to),
    ...HAULING_URL_FILTERS,
  };
}

type HaulingUrlValues = UrlParamValues<ReturnType<typeof haulingUrl>>;

const useIntroDismissed = createLocalSetting<boolean>({
  key: 'haulingIntroDismissed',
  defaultValue: false,
});

/**
 * The list's optional (non-identity) columns, for `ColumnPickerMenu`
 * (issue: hauling toolbar redesign). `select`/`item` stay out of `ids` —
 * hiding either loses the row's own identity or the multibuy checkbox.
 */
const HAULING_COLUMN_IDS = [
  'buy',
  'expected',
  'margin',
  'days',
  'demand',
  'flags',
  'bring',
] as const;
type HaulingColumnId = (typeof HAULING_COLUMN_IDS)[number];

const useHaulingColumns = createColumnVisibilitySetting<HaulingColumnId>({
  key: 'haulingColumns',
  ids: HAULING_COLUMN_IDS,
});

const DEMAND_DOT: Record<HaulingViewRow['demand']['demand'], string> = {
  'most-days': 'bg-success',
  bursts: 'bg-warning',
  rarely: 'bg-danger',
};

function hubFor(id: TradeHub['id']): TradeHub {
  return TRADE_HUBS.find((h) => h.id === id) ?? TRADE_HUBS[0]!;
}

function signed(value: number, fractionDigits: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(fractionDigits)}`;
}

export function HaulingPanel() {
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
      values: {
        days: haulingFilterPref.days,
        margin: haulingFilterPref.margin,
        demand: haulingFilterPref.demand,
      },
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
  const from = hubFor(params.from);
  const to = hubFor(params.to);
  const categoryId = isHaulingCategoryId(params.cat) ? params.cat : DEFAULT_HAULING_CATEGORY_ID;

  const columnVisibility = useColumnVisibility(useHaulingColumns, HAULING_COLUMN_IDS);

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

  const sameHub = from.id === to.id;
  const { state, refresh } = useHaulingScan(
    from,
    to,
    categoryId,
    // Not before the default hub has loaded: until then the lane is the
    // fallback one, and scanning it would spend ESI budget on the wrong route.
    defaultHubHydrated && from.id !== to.id
  );
  const fees = useHaulingFees(activeCharacterId, to);

  const viewRows = useMemo(
    () => (state.status === 'ready' ? toViewRows(state.scan.rows, fees) : []),
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

  // The user's edits belong to one scan: a new route or category starts a fresh plan.
  const [overrides, setOverrides] = useState<ReadonlyMap<number, TripOverride>>(new Map());
  const scanKey = `${from.id}>${to.id}:${categoryId}`;
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
        fees,
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
  async function copyMultibuy() {
    try {
      await writeToClipboard(listText);
      setCopyStatus('copied');
    } catch {
      // Clipboard refused: the list is still on screen to copy by hand, but
      // say so rather than leaving the button looking like it did nothing.
      setCopyStatus('failed');
    }
  }

  const limitText = (line: TripLine): string => {
    const unit = line.volumeM3 > 0 ? `${Math.round(line.volumeM3).toLocaleString()} m³ · ` : '';
    return `${unit}${t(`market.hauling.limit.${line.limitedBy}`)}`;
  };

  const flagLabel: Record<HaulingFlag, { text: string; tip: string }> = {
    crowded: { text: t('market.hauling.flags.crowded'), tip: t('market.hauling.flags.crowdedTip') },
    thin: { text: t('market.hauling.flags.thin'), tip: t('market.hauling.flags.thinTip') },
    outlier: {
      text: t('market.hauling.flags.outlier'),
      tip: t('market.hauling.flags.outlierTip'),
    },
    'low-margin': {
      text: t('market.hauling.flags.lowMargin'),
      tip: t('market.hauling.flags.lowMarginTip'),
    },
  };

  // The same menu Appraisal's rows carry — a hauled item is an item like any other.
  function rowContextMenu(row: HaulingViewRow, tr: ReactElement) {
    return (
      <ItemContextMenu typeId={row.typeId} itemName={row.name}>
        {tr}
      </ItemContextMenu>
    );
  }

  const columns: DataTableColumn<HaulingViewRow>[] = [
    {
      id: 'select',
      header: '',
      headerClassName: 'w-8',
      className: 'w-8',
      cardCorner: 'start',
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
      sortValue: (row) => row.name.toLowerCase(),
      render: (row) => (
        <span className="flex items-center gap-2">
          <TypeIcon typeId={row.typeId} size={32} className="size-6 shrink-0" />
          <span className="flex min-w-0 flex-col">
            <MarketItemLink
              typeId={row.typeId}
              className="font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {row.name}
            </MarketItemLink>
            <span className="text-[0.6875rem] text-text-dim">
              {t('market.hauling.volumeEach', {
                m3: row.unitVolumeM3.toLocaleString(undefined, { maximumFractionDigits: 3 }),
              })}
            </span>
          </span>
        </span>
      ),
    },
    {
      id: 'buy',
      headerClassName: 'whitespace-nowrap',
      header: t('market.hauling.columns.buy'),
      align: 'right',
      className: 'tabular-nums whitespace-nowrap',
      sortValue: (row) => row.buyLadder[0]?.price,
      render: (row) => formatIsk(row.buyLadder[0]?.price ?? 0, 2),
    },
    {
      id: 'expected',
      headerClassName: 'whitespace-nowrap',
      header: t('market.hauling.columns.expected'),
      headerTooltip: t('market.hauling.columns.expectedTip'),
      align: 'right',
      className: 'tabular-nums whitespace-nowrap',
      sortValue: (row) => row.sale.price,
      render: (row) => formatIsk(row.sale.price, 2),
    },
    {
      id: 'margin',
      headerClassName: 'whitespace-nowrap',
      header: t('market.hauling.columns.margin'),
      headerTooltip: t('market.hauling.columns.marginTip'),
      align: 'right',
      className: 'tabular-nums whitespace-nowrap',
      cellClassName: (row) =>
        row.marginPct >= HAULING_THRESHOLDS.lowMarginPct ? 'text-success' : 'text-text-dim',
      sortValue: (row) => row.marginPct,
      render: (row) => (
        <span className="flex flex-col items-end font-semibold">
          {signed(row.marginPct, 1)}%
          <span className="text-[0.6875rem] font-normal text-text-dim">
            {t('market.hauling.profitEach', {
              isk: `${row.profitPerUnit >= 0 ? '+' : ''}${formatIsk(row.profitPerUnit, 0)}`,
            })}
          </span>
        </span>
      ),
    },
    {
      id: 'days',
      headerClassName: 'whitespace-nowrap',
      header: t('market.hauling.columns.days'),
      headerTooltip: t('market.hauling.columns.daysTip'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: (row) => row.sale.daysToSell,
      render: (row) => formatDaysToSell(row.sale.daysToSell),
    },
    {
      id: 'demand',
      headerClassName: 'whitespace-nowrap',
      header: t('market.hauling.columns.demand'),
      sortValue: (row) => row.demand.daysWithTrades,
      render: (row) => (
        <span
          className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs"
          title={t('market.hauling.demandDays', { count: row.demand.daysWithTrades })}
        >
          <span
            aria-hidden="true"
            className={`size-2 rounded-full ${DEMAND_DOT[row.demand.demand]}`}
          />
          {t(`market.hauling.demand.${row.demand.demand}`)}
        </span>
      ),
    },
    {
      id: 'flags',
      headerClassName: 'whitespace-nowrap',
      header: t('market.hauling.columns.flags'),
      render: (row) => (
        <span className="flex flex-wrap gap-1">
          {row.flags.map((flag) => (
            <span
              key={flag}
              title={flagLabel[flag].tip}
              className="rounded-xs border border-warning/50 px-1.5 py-0.5 text-[0.6875rem] text-warning"
            >
              {flagLabel[flag].text}
            </span>
          ))}
        </span>
      ),
    },
    {
      id: 'bring',
      headerClassName: 'whitespace-nowrap',
      header: t('market.hauling.columns.bring'),
      align: 'right',
      className: 'whitespace-nowrap',
      render: (row) => {
        const line = lineOf.get(row.typeId);
        if (!line) return null;
        return (
          <span className="flex flex-col items-end gap-0.5">
            <BringInput
              label={t('market.hauling.bringRow', { item: row.name })}
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
            <span className="text-[0.6875rem] text-text-dim">{limitText(line)}</span>
          </span>
        );
      },
    },
  ];

  // Hideable columns only — `select` and `item` (the row's own identity)
  // are always shown, so they're left out of the picker's catalog entirely.
  const hideableColumnsById = Object.fromEntries(
    columns
      .filter((column): column is DataTableColumn<HaulingViewRow> & { id: HaulingColumnId } =>
        (HAULING_COLUMN_IDS as readonly string[]).includes(column.id)
      )
      .map((column) => [column.id, column])
  ) as Record<HaulingColumnId, DataTableColumn<HaulingViewRow>>;
  const visibleColumns = columns.filter(
    (column) =>
      !(HAULING_COLUMN_IDS as readonly string[]).includes(column.id) ||
      columnVisibility.isVisible(column.id as HaulingColumnId)
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

  const activeFilterCount =
    (params.days !== DEFAULT_HAULING_FILTER.days ? 1 : 0) +
    (params.margin !== DEFAULT_HAULING_FILTER.margin ? 1 : 0) +
    (params.demand !== DEFAULT_HAULING_FILTER.demand ? 1 : 0);
  const filterValue = { days: params.days, margin: params.margin, demand: params.demand };

  return (
    <Panel
      title={t('market.hauling.title')}
      actionsFill
      actions={
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
          <HaulingCargoControl
            characterId={activeCharacterId}
            cargo={cargo}
            onCargoChange={(next) => void setCargo(next)}
            budget={budget}
            onBudgetChange={(next) => void setBudget(next)}
          />
          <Button size="sm" disabled={plan.totals.items === 0} onClick={() => void copyMultibuy()}>
            {t('market.hauling.copyMultibuy', { count: plan.totals.items })}
          </Button>
          <span className="flex items-center gap-2">
            {state.status === 'ready' && <DataAgeBadge date={new Date(state.scan.fetchedAt)} />}
            <IconButton
              size="sm"
              icon={<Icon.Refresh />}
              label={t('market.refresh')}
              onClick={refresh}
              disabled={state.status !== 'ready'}
            />
          </span>
        </div>
      }
      padded={false}
    >
      <FilterBar
        value={filterValue}
        onChange={(next) => setParams(next)}
        activeCount={activeFilterCount}
        title={t('market.hauling.filters.title')}
        className="border-b border-line px-3 py-3"
        search={
          <>
            <HubField
              label={t('market.hauling.from')}
              value={from.id}
              onChange={(id) => setParams(pickHaulingHub({ from: from.id, to: to.id }, 'from', id))}
            />
            <span aria-hidden="true" className="text-text-faint">
              →
            </span>
            <HubField
              label={t('market.hauling.to')}
              value={to.id}
              onChange={(id) => setParams(pickHaulingHub({ from: from.id, to: to.id }, 'to', id))}
            />
            <label className="flex flex-col gap-1 text-[0.625rem] font-semibold tracking-widest text-text-dim uppercase">
              {t('market.hauling.category')}
              <Select
                value={String(categoryId)}
                onValueChange={(value) => setParams({ cat: Number(value) })}
              >
                <SelectTrigger size="sm" aria-label={t('market.hauling.category')} className="w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HAULING_CATEGORY_IDS.map((id) => (
                    <SelectItem key={id} value={String(id)}>
                      {categoryName(id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </>
        }
        actions={
          <ColumnPickerMenu
            available={HAULING_COLUMN_IDS}
            visible={columnVisibility.visible}
            columnsById={hideableColumnsById}
            onToggle={columnVisibility.toggle}
            onReset={columnVisibility.reset}
            resetLabel={t('common.resetColumns')}
            buttonLabel={t('common.columnsButton')}
            menuTitle={t('common.columnsMenuTitle')}
            size="sm"
          />
        }
      >
        {(draft, setDraft) => (
          <>
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
            <FilterField label={t('market.hauling.filters.demand')}>
              <Select
                value={draft.demand}
                onValueChange={(v) => setDraft({ ...draft, demand: v as 'steady' | 'any' })}
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
            <p className="text-[0.6875rem] text-text-dim">
              {t('market.hauling.feesLine', {
                accounting: fees.accountingLevel,
                broker: fees.brokerRelationsLevel,
              })}
            </p>
          </>
        )}
      </FilterBar>

      {!introDismissed && (
        <div className="flex items-start justify-between gap-3 border-b border-accent-dim bg-accent/10 px-3 py-2 text-sm">
          <p>
            <b>{t('market.hauling.introLead')}</b> {t('market.hauling.introBody')}
          </p>
          <Button variant="ghost" size="sm" onClick={() => void setIntroDismissed(true)}>
            {t('market.hauling.introDismiss')}
          </Button>
        </div>
      )}

      {sameHub ? (
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
                hidden.thin + hidden.slow + hidden.lowMargin > 0
                  ? t('market.hauling.emptyHiddenHint', {
                      scanned: state.scan.scanned,
                      thin: hidden.thin,
                      slow: hidden.slow,
                      low: hidden.lowMargin,
                    })
                  : t('market.hauling.emptyHint', { scanned: state.scan.scanned })
              }
              action={
                <Button size="sm" onClick={() => setParams(DEFAULT_HAULING_FILTER)}>
                  {t('common.resetFilters')}
                </Button>
              }
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b border-line bg-panel-2 px-3 py-3">
                <StatChip
                  label={t('market.hauling.plan.profit')}
                  value={formatIskCompact(plan.totals.profit)}
                  tone={plan.totals.profit > 0 ? 'success' : 'default'}
                />
                <StatChip
                  label={t('market.hauling.plan.spend')}
                  value={formatIskCompact(plan.totals.cost)}
                />
                <StatChip label={t('market.hauling.plan.items')} value={plan.totals.items} />
                <StatChip
                  label={t('market.hauling.plan.selected')}
                  value={t('market.hauling.plan.selectedOf', {
                    selected: selectedCount,
                    total: shown.length,
                  })}
                />
                {cargo !== null && heldPct !== null && (
                  <div className="flex min-w-48 flex-col gap-1">
                    <div
                      role="img"
                      aria-label={t('market.hauling.plan.holdAria', {
                        used: Math.round(plan.totals.volumeM3).toLocaleString(),
                        total: Math.round(cargo.m3).toLocaleString(),
                      })}
                      className="h-2 w-full bg-line"
                    >
                      <div className="h-full bg-accent" style={{ width: `${heldPct}%` }} />
                    </div>
                    <span className="text-[0.6875rem] text-text-dim">
                      {t('market.hauling.plan.holdUsed', {
                        used: Math.round(plan.totals.volumeM3).toLocaleString(),
                        total: Math.round(cargo.m3).toLocaleString(),
                      })}
                      {bindingText ? ` · ${bindingText}` : ''}
                    </span>
                  </div>
                )}
                {cargo === null && (
                  <span className="text-[0.6875rem] text-text-dim">
                    {t('market.hauling.cargo.tip')}
                  </span>
                )}
                <div className="flex-1" />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setOverrides(new Map())}
                  disabled={overrides.size === 0}
                >
                  {t('market.hauling.fillHold')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setOverrides(new Map(shown.map((r) => [r.typeId, { selected: false }])))
                  }
                >
                  {t('market.hauling.clearAll')}
                </Button>
              </div>

              <DataTable
                label={t('market.hauling.title')}
                columns={visibleColumns}
                rows={shown}
                rowKey={(row) => row.typeId}
                density="compact"
                stackLayout="labelled"
                stackColumns={1}
                rowContextMenu={rowContextMenu}
                rowMoreActions
                expandableRow={{
                  renderDetail: (row) => (
                    <HaulingRowDetail row={row} from={from} to={to} fees={fees} />
                  ),
                }}
                rowClassName={(row) =>
                  overrides.get(row.typeId)?.selected === false ? 'opacity-60' : undefined
                }
              />

              <div className="flex flex-wrap items-start gap-4 border-t border-accent-dim bg-panel-2 px-3 py-3">
                <label className="flex items-center gap-2 text-xs text-text-dim">
                  <Checkbox
                    aria-label={t('market.hauling.selectAll')}
                    checked={allSelected}
                    onChange={(event) =>
                      setOverrides(
                        event.target.checked
                          ? new Map()
                          : new Map(shown.map((r) => [r.typeId, { selected: false }]))
                      )
                    }
                  />
                  {t('market.hauling.selectAll')}
                </label>
                <div className="flex min-w-60 flex-1 flex-col gap-1">
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
                <Button disabled={plan.totals.items === 0} onClick={() => void copyMultibuy()}>
                  {t('market.hauling.copyMultibuy', { count: plan.totals.items })}
                </Button>
              </div>

              <p className="border-t border-line px-3 py-2 text-[0.6875rem] text-text-dim">
                {hidden.thin + hidden.slow + hidden.lowMargin > 0
                  ? t('market.hauling.hiddenLine', {
                      thin: hidden.thin,
                      slow: hidden.slow,
                      low: hidden.lowMargin,
                    })
                  : t('market.hauling.scannedLine', { count: state.scan.scanned })}
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

function HubField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: TradeHub['id'];
  onChange: (id: TradeHub['id']) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-[0.625rem] font-semibold tracking-widest text-text-dim uppercase">
      {label}
      <Select value={value} onValueChange={(next) => onChange(next as TradeHub['id'])}>
        <SelectTrigger size="sm" aria-label={label} className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TRADE_HUBS.map((h) => (
            <SelectItem key={h.id} value={h.id}>
              {h.systemName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

/**
 * The quantity to bring, typed by hand. Keeps what is being typed in its own
 * state so the box can be emptied and retyped: the planned quantity it would
 * otherwise echo back is clamped and re-sized on every keystroke. Emptying it
 * or typing 0 unticks the row.
 */
function BringInput({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string;
  onCommit: (quantity: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <TextInput
      size="sm"
      inputMode="numeric"
      aria-label={label}
      className="w-24 text-right tabular-nums"
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
