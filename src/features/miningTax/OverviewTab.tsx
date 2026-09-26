/**
 * Mining Yield Overview tab (issue #671): what a pilot actually mined —
 * ordinary belt/anomaly ore and ice, moon ore included, and harvested gas
 * (issue #880) — across every tracked Character, as ISK/hr and a
 * raw-vs-refined value comparison. Gas reprocesses into nothing, so it
 * contributes a real zero to the refined side rather than a missing one. Sits
 * beside the Tax tab (`TaxTab.tsx`) on the same route; the two read the same
 * ESI mining ledger but group and value it for entirely different questions
 * (see `docs/context/decisions/…-mining-yield-isk-hr-basis-is-calendar-time.md`
 * and the vocabulary note in the issue: this is deliberately not the Tax
 * tab's `MiningLedgerEntry`/`Assignment`/`Payee` model).
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  ColumnPickerMenu,
  DataAgeBadge,
  DataTable,
  DataTableDenseCell,
  EmptyState,
  IconButton,
  IskAmount,
  PageHeader,
  Panel,
  Spinner,
  Tooltip,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { beginGrant } from '@/app/grantAction';
import { useRouteSnapshot } from '@/lib/useRouteSnapshot';
import { formatVolume } from '@/features/market/format';
import { CharacterFilterControl } from '@/features/character/CharacterFilterControl';
import { ImplantsAssumedNote } from '@/features/character/ImplantsAssumedNote';
import { useResolvedCharacterFilter } from '@/features/character/characterFilterValue';
import { characterFilterParam } from '@/features/character/characterFilterUrlParam';
import { SecurityValue } from '@/features/character/assetBrowserRows';
import { useUrlParam, useUrlSort } from '@/lib/useUrlState';
import {
  loadMiningYieldSnapshot,
  type MiningYieldRow,
  type MiningYieldSnapshot,
} from './yieldSnapshot';
import { iskPerCalendarHour } from '@/engine/miningTax/yieldRate';
import { daysCovered, eveToday, rangeDates, rangeStartDate } from '@/engine/miningTax/yieldRange';
import { scaleUnitPrices, scaleValuation } from '@/engine/miningTax/buybackRate';
import { useMiningYieldRange } from './yieldRangePref';
import { useMiningPriceBasis } from './priceBasisPref';
import { useMiningBuybackRate } from './buybackRatePref';
import { useMiningShowRefining } from './showRefiningPref';
import {
  availableOverviewColumns,
  DEFAULT_VISIBLE_OVERVIEW_COLUMNS,
  useVisibleOverviewColumns,
  visibleAvailableColumns,
  type OverviewColumnId,
} from './overviewColumns';
import { oreBreakdownSummary, sumUnits } from './oreBreakdown';
import {
  BuybackRateInput,
  MobileSettings,
  PriceBasisOptions,
  RangeControl,
  ShowRefiningToggle,
  ValueMenu,
} from './OverviewSettings';
import { basisSummary, basisUsage } from './basisLabel';
import { countDaysBySource, weakestSource, type PriceSource } from '@/engine/miningTax/priceBasis';
import { YieldDetailModal } from './YieldDetailModal';
import { sumVolume, volumeDisplayMode } from './volume';
import { VolumeDisplay } from './volumeDisplay';
import type { DailyRatePoint, TypeComparisonPoint } from './MiningYieldCharts';

const LazyMiningYieldCharts = lazy(() => import('./MiningYieldCharts'));

const OVERVIEW_CHARACTER_FILTER_PARAM = characterFilterParam('all');
const OVERVIEW_DEFAULT_SORT = { columnId: 'date', direction: 'desc' as const };

/** A row's mined m³ — units times the type's own unit volume for each ore line. */
function entryVolume(row: MiningYieldRow, typeVolumes: ReadonlyMap<number, number>) {
  return sumVolume(
    row.entry.oreLines,
    (line) => line.typeId,
    (line) => line.quantity,
    typeVolumes
  );
}

function dateRangeLabel(dates: readonly string[]): string {
  if (dates.length === 0) return '—';
  const sorted = [...dates].sort();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  return first === last ? first : `${first} – ${last}`;
}

const SOURCE_TAG_CLASS: Record<PriceSource, string> = {
  saved: 'border-line-bright text-text-dim',
  average: 'border-warning/50 text-warning',
  live: 'border-accent-dim text-accent',
  none: 'border-line text-text-dim',
};

/**
 * Saved / Daily avg / Live / No price — where a row's ore prices came from on
 * the chosen basis, with a tooltip saying what that means. A button so the
 * tooltip is reachable by keyboard and a tap; the table keeps the click from
 * also opening the row's detail modal.
 */
function PriceSourceTag({ source }: { source: PriceSource }) {
  const { t } = useTranslation();
  return (
    <Tooltip content={t(`miningTax.overview.priceSourceHint.${source}`)} openOnTap>
      <button
        type="button"
        className={`cursor-help rounded-xs border px-1.5 py-0.5 text-[0.6875rem] font-semibold tracking-widest uppercase focus-visible:outline-2 focus-visible:outline-accent ${SOURCE_TAG_CLASS[source]}`}
      >
        {t(`miningTax.overview.priceSource.${source}`)}
      </button>
    </Tooltip>
  );
}

interface OverviewTabProps {
  /** The route's shared tab bar, rendered under this tab's own `PageHeader`. See `MoonMiningTax`. */
  tabBar: ReactNode;
}

export function OverviewTab({ tabBar }: OverviewTabProps) {
  const { t } = useTranslation();
  const showRefining = useMiningShowRefining((state) => state.value);
  const setShowRefining = useMiningShowRefining((state) => state.setValue);
  const hydrateShowRefining = useMiningShowRefining((state) => state.hydrate);
  // `showRefining` decides what the loader itself fetches (issue #1281), so
  // unlike basis/buyback-rate — which only rescale already-loaded rows — it
  // must be part of the load closure. `useRouteSnapshot` only re-runs it on
  // an epoch bump, so toggling the switch also calls `refresh()` below.
  const loadSnapshot = useCallback(
    (): Promise<MiningYieldSnapshot> => loadMiningYieldSnapshot(showRefining),
    [showRefining]
  );
  const { data, error, loading, activeCharacterId, refresh } = useRouteSnapshot(
    loadSnapshot,
    undefined,
    { cacheKey: 'miningYieldOverview' }
  );

  const [characterFilter, setCharacterFilter] = useUrlParam(
    'overview.character',
    OVERVIEW_CHARACTER_FILTER_PARAM
  );
  const [detailRow, setDetailRow] = useState<MiningYieldRow | null>(null);
  const resolvedCharacterFilter = useResolvedCharacterFilter(characterFilter, activeCharacterId);
  const range = useMiningYieldRange((state) => state.value);
  const setRange = useMiningYieldRange((state) => state.setValue);
  const hydrateRange = useMiningYieldRange((state) => state.hydrate);
  const basis = useMiningPriceBasis((state) => state.value);
  const setBasis = useMiningPriceBasis((state) => state.setValue);
  const hydrateBasis = useMiningPriceBasis((state) => state.hydrate);
  const buybackRate = useMiningBuybackRate((state) => state.value);
  const setBuybackRate = useMiningBuybackRate((state) => state.setValue);
  const hydrateBuybackRate = useMiningBuybackRate((state) => state.hydrate);
  const visibleColumns = useVisibleOverviewColumns((state) => state.value);
  const setVisibleColumns = useVisibleOverviewColumns((state) => state.setValue);
  const hydrateVisibleColumns = useVisibleOverviewColumns((state) => state.hydrate);
  useEffect(() => {
    void hydrateRange();
    void hydrateBasis();
    void hydrateBuybackRate();
    void hydrateShowRefining();
    void hydrateVisibleColumns();
  }, [hydrateRange, hydrateBasis, hydrateBuybackRate, hydrateShowRefining, hydrateVisibleColumns]);
  const handleShowRefiningChange = useCallback(
    (next: boolean) => {
      void setShowRefining(next);
      refresh();
    },
    [setShowRefining, refresh]
  );
  // EVE/UTC, the ledger's own calendar. Recomputed each render so a tab left
  // open past downtime moves its window with the day.
  const today = eveToday();

  const characters = data?.characters ?? [];
  const showCharacterColumn = characters.length > 1;
  const availableColumnIds = availableOverviewColumns(showRefining, showCharacterColumn);
  // `id` is already known available here, so this is just "is it checked" —
  // `visibleAvailableColumns` (below, `handleToggleColumn`'s own
  // zero-columns guard) is for narrowing the *raw stored* list, which can
  // hold ids that aren't available right now; this list already excludes
  // those.
  const activeColumnIds = availableColumnIds.filter((id) => visibleColumns.includes(id));

  function handleToggleColumn(id: OverviewColumnId) {
    const next = visibleColumns.includes(id)
      ? visibleColumns.filter((existing) => existing !== id)
      : [...visibleColumns, id];
    // A table with zero *rendered* columns (besides the locked Date one) is
    // as good as no picker at all — guard against the filtered/available
    // count, same as Characters' table-view picker.
    if (visibleAvailableColumns(next, showRefining, showCharacterColumn).length === 0) return;
    void setVisibleColumns(next);
  }

  function handleResetColumns() {
    void setVisibleColumns(DEFAULT_VISIBLE_OVERVIEW_COLUMNS);
  }

  const characterRows = useMemo(
    () =>
      (data?.rows ?? []).filter(
        (row) => resolvedCharacterFilter === 'all' || resolvedCharacterFilter.has(row.characterId)
      ),
    [data, resolvedCharacterFilter]
  );
  // In range, re-valued on the chosen price basis (every basis is
  // precomputed in the snapshot, so this is a swap, never a refetch), and
  // scaled by the buyback rate (issue #1280) — done here, once, so every
  // downstream consumer (stat cards, charts, table, detail modal) sees
  // already-scaled values without needing to know about the rate itself.
  const visibleRows = useMemo(() => {
    const start = rangeStartDate(range, today);
    return characterRows
      .filter((row) => row.entry.date >= start && row.entry.date <= today)
      .map((row) => {
        const basisRow = { ...row, ...row.byBasis[basis] };
        return {
          ...basisRow,
          valuation: scaleValuation(basisRow.valuation, buybackRate),
          materialUnitPrices: scaleUnitPrices(basisRow.materialUnitPrices, buybackRate),
        };
      });
  }, [characterRows, range, today, basis, buybackRate]);
  // Each row refines under its own Character's modifiers, so the implant
  // note is per Character too — one for each shown miner lacking the grant.
  const refiningCharacters = useMemo(() => {
    if (!showRefining) return [];
    const byId = new Map<number, string>();
    for (const row of visibleRows) byId.set(row.characterId, row.characterName);
    return [...byId].map(([characterId, characterName]) => ({ characterId, characterName }));
  }, [showRefining, visibleRows]);
  const coverage = useMemo(() => {
    let oldestSaved: string | null = null;
    for (const row of characterRows) {
      if (oldestSaved === null || row.entry.date < oldestSaved) oldestSaved = row.entry.date;
    }
    return daysCovered(
      visibleRows.map((row) => row.entry.date),
      range,
      today,
      oldestSaved
    );
  }, [characterRows, visibleRows, range, today]);

  const totals = useMemo(() => {
    const typeVolumes = data?.typeVolumes ?? new Map<number, number>();
    let rawValue = 0;
    let refineValue = 0;
    let volumeM3 = 0;
    const missingVolumeTypeIds = new Set<number>();
    const dates: string[] = [];
    for (const row of visibleRows) {
      rawValue += row.valuation.rawValue;
      refineValue += row.valuation.refineValue;
      dates.push(row.entry.date);
      const rowVolume = entryVolume(row, typeVolumes);
      volumeM3 += rowVolume.m3;
      for (const typeId of rowVolume.missingTypeIds) missingVolumeTypeIds.add(typeId);
    }
    return {
      rawValue,
      refineValue,
      volume: { m3: volumeM3, missingTypeIds: [...missingVolumeTypeIds] },
      dates,
      iskPerHour: iskPerCalendarHour(rawValue, dates),
    };
  }, [visibleRows, data]);

  const daysBySource = useMemo(
    () =>
      countDaysBySource(visibleRows.map((r) => ({ date: r.entry.date, source: r.priceSource }))),
    [visibleRows]
  );
  const dailyRate: DailyRatePoint[] = useMemo(() => {
    const byDate = new Map<string, number>();
    const sourcesByDate = new Map<string, PriceSource[]>();
    for (const row of visibleRows) {
      byDate.set(row.entry.date, (byDate.get(row.entry.date) ?? 0) + row.valuation.rawValue);
      const list = sourcesByDate.get(row.entry.date) ?? [];
      list.push(row.priceSource);
      sourcesByDate.set(row.entry.date, list);
    }
    // Every day of the range, mined or not, so the axis spans the whole window
    // and a gap (or days before saved history began) reads as a gap. Each bar
    // carries its day's weakest price source, so the chart can colour it.
    return rangeDates(range, today).map((date) => {
      const sources = sourcesByDate.get(date);
      return {
        date,
        iskPerHour: (byDate.get(date) ?? 0) / 24,
        source: sources ? weakestSource(sources) : null,
      };
    });
  }, [visibleRows, range, today]);

  const typeComparison: TypeComparisonPoint[] = useMemo(() => {
    const byType = new Map<number, { rawValue: number; refineValue: number }>();
    for (const row of visibleRows) {
      for (const line of row.valuation.lines) {
        const existing = byType.get(line.typeId) ?? { rawValue: 0, refineValue: 0 };
        existing.rawValue += line.rawValue;
        existing.refineValue += line.refineValue;
        byType.set(line.typeId, existing);
      }
    }
    return [...byType.entries()].map(([typeId, values]) => ({
      typeId,
      typeName: data?.typeNames.get(typeId) ?? `#${typeId}`,
      ...values,
    }));
  }, [visibleRows, data]);

  function systemName(row: MiningYieldRow): string {
    return data?.systemNames.get(row.entry.solarSystemId) ?? `#${row.entry.solarSystemId}`;
  }

  const columnsById: Record<OverviewColumnId, DataTableColumn<MiningYieldRow>> = {
    character: {
      id: 'character',
      header: t('miningTax.characterColumn'),
      render: (row) => row.characterName,
      sortValue: (row) => row.characterName,
    },
    system: {
      id: 'system',
      header: t('miningTax.systemColumn'),
      render: (row) => (
        <DataTableDenseCell>
          {systemName(row)}
          <SecurityValue security={data?.systemSecurity.get(row.entry.solarSystemId)} t={t} />
        </DataTableDenseCell>
      ),
      sortValue: (row) => systemName(row),
    },
    volume: {
      id: 'volume',
      header: t('miningTax.overview.volumeColumn'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (row) => (
        <VolumeDisplay
          volume={entryVolume(row, data?.typeVolumes ?? new Map())}
          typeNames={data?.typeNames ?? new Map()}
          t={t}
        />
      ),
      sortValue: (row) => entryVolume(row, data?.typeVolumes ?? new Map()).m3,
      stackAffix: { after: ` ${t('miningTax.overview.volumeUnit')}` },
    },
    rawValue: {
      id: 'rawValue',
      header: t('miningTax.overview.rawSellValue'),
      align: 'right',
      className: 'whitespace-nowrap',
      render: (row) => <IskAmount value={row.valuation.rawValue} revealOn="tap" decimals={0} />,
      sortValue: (row) => row.valuation.rawValue,
      // Dense phone card's headline figure (`stackLayout="dense"` below) —
      // this is the column that's on by default, so it's the number a
      // reader's eye should land on first.
      cardCorner: true,
    },
    total: {
      id: 'total',
      header: t('miningTax.overview.totalColumn'),
      align: 'right',
      className: 'whitespace-nowrap',
      render: (row) => <IskAmount value={row.valuation.rawValue} revealOn="tap" decimals={0} />,
      sortValue: (row) => row.valuation.rawValue,
      stackAffix: { before: `${t('miningTax.overview.totalColumn')} ` },
    },
    refineValue: {
      id: 'refineValue',
      header: t('miningTax.overview.refineValue'),
      align: 'right',
      className: 'whitespace-nowrap',
      render: (row) => <IskAmount value={row.valuation.refineValue} revealOn="tap" decimals={0} />,
      sortValue: (row) => row.valuation.refineValue,
      // Short, dense-meta-line label ("Refined 91.6M"): the full column
      // header ("Refined value") is right for a desktop table but repeats
      // the word "value" the phone card has no room for.
      stackAffix: { before: `${t('miningTax.overview.refineValueShort')} ` },
    },
    oreBreakdown: {
      id: 'oreBreakdown',
      header: t('miningTax.overview.oreBreakdownColumn'),
      render: (row) => oreBreakdownSummary(row.entry.oreLines, data?.typeNames ?? new Map()),
      sortValue: (row) => oreBreakdownSummary(row.entry.oreLines, data?.typeNames ?? new Map()),
    },
    units: {
      id: 'units',
      header: t('miningTax.overview.unitsColumn'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (row) => sumUnits(row.entry.oreLines).toLocaleString(),
      sortValue: (row) => sumUnits(row.entry.oreLines),
      stackAffix: { after: ` ${t('miningTax.overview.unitsColumn').toLowerCase()}` },
    },
    pricing: {
      id: 'pricing',
      header: t('miningTax.overview.pricingColumn'),
      className: 'whitespace-nowrap',
      render: (row) => (
        <DataTableDenseCell>
          <PriceSourceTag source={row.priceSource} />
          {!row.valuation.pricedAll && (
            <span className="text-[0.6875rem] text-warning">
              {t('miningTax.overview.pricingPartial')}
            </span>
          )}
        </DataTableDenseCell>
      ),
      sortValue: (row) => `${row.priceSource}:${row.valuation.pricedAll ? 1 : 0}`,
    },
  };

  const columns: DataTableColumn<MiningYieldRow>[] = [
    {
      id: 'date',
      header: t('miningTax.dateColumn'),
      headerTooltip: t('miningTax.dateEveHint'),
      render: (row) => row.entry.date,
      sortValue: (row) => row.entry.date,
      primary: true,
    },
    ...activeColumnIds.map((id) => columnsById[id]),
  ];

  const overviewSort = useUrlSort(
    'overview.sort',
    OVERVIEW_DEFAULT_SORT,
    columns.map((c) => c.id)
  );

  return (
    <div className="space-y-4">
      {/* Same shape as `TaxTab`: this tab owns its snapshot, so it owns the
          header whose actions drive it. */}
      <PageHeader
        title={t('miningTax.title')}
        // `CharacterFilterControl` rides here rather than in `actions` per
        // `docs/context/decisions/20260908-192806-the-character-filter-rides-in-the-panel-header.md`
        // — this tab has no titled inner `Panel` to attach it to, so it
        // takes the page-level title band instead, the same "names whose
        // data this is" role the decision describes for a panel's own
        // `meta`.
        meta={
          <>
            {data?.fetchedAt ? <DataAgeBadge date={data.fetchedAt} /> : undefined}
            {characters.length > 0 && (
              <CharacterFilterControl
                characters={characters.map((c) => ({
                  characterId: c.characterId,
                  characterName: c.characterName,
                }))}
                activeCharacterId={activeCharacterId}
                value={characterFilter}
                onChange={setCharacterFilter}
              />
            )}
          </>
        }
        actions={
          <>
            <div className="hidden items-center gap-2 sm:flex">
              <RangeControl value={range} onChange={(next) => void setRange(next)} />
              <ValueMenu basis={basis} buybackRate={buybackRate}>
                <PriceBasisOptions value={basis} onChange={(next) => void setBasis(next)} />
                <BuybackRateInput
                  value={buybackRate}
                  onChange={(next) => void setBuybackRate(next)}
                />
                <ShowRefiningToggle value={showRefining} onChange={handleShowRefiningChange} />
              </ValueMenu>
            </div>
            <div className="sm:hidden">
              <MobileSettings range={range} basis={basis} buybackRate={buybackRate}>
                <RangeControl value={range} onChange={(next) => void setRange(next)} fill />
                <PriceBasisOptions value={basis} onChange={(next) => void setBasis(next)} />
                <BuybackRateInput
                  value={buybackRate}
                  onChange={(next) => void setBuybackRate(next)}
                />
                <ShowRefiningToggle value={showRefining} onChange={handleShowRefiningChange} />
              </MobileSettings>
            </div>
            <IconButton
              icon={<Icon.Refresh />}
              label={t('miningTax.refresh')}
              onClick={refresh}
              disabled={loading}
            />
          </>
        }
      />
      {tabBar}

      {loading && !data ? (
        <div className="flex justify-center py-16">
          <Spinner label={t('common.loading')} />
        </div>
      ) : error ? (
        <EmptyState title={t('common.loadFailedTitle')} hint={t('common.loadFailedHint')} />
      ) : (
        <>
          {data && data.fromCache && (
            <p className="text-[0.6875rem] text-warning uppercase">{t('common.offlineTitle')}</p>
          )}

          {data && data.reauthCharacters.length > 0 && (
            <div
              role="alert"
              className="space-y-1 rounded-xs border border-warning/60 bg-warning/10 p-2 text-xs"
            >
              <p className="font-semibold text-warning uppercase">{t('miningTax.reauthTitle')}</p>
              <ul className="space-y-1">
                {data.reauthCharacters.map((c) => (
                  <li key={c.characterId} className="flex items-center justify-between gap-2">
                    <span>
                      {t('miningTax.reauthCharacterHint', { character: c.characterName })}
                    </span>
                    <Button
                      size="sm"
                      onClick={() => void beginGrant(c.characterId, ['getCharacterMining'])}
                    >
                      {t('miningTax.reauthAction')}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="empty:hidden">
            {refiningCharacters.map((c) => (
              <ImplantsAssumedNote
                key={c.characterId}
                characterId={c.characterId}
                hint={t('miningTax.overview.refineAssumesNoImplantsHint', {
                  character: c.characterName,
                })}
              />
            ))}
          </div>

          {visibleRows.length === 0 ? (
            <EmptyState
              title={t('miningTax.overview.emptyTitle')}
              hint={t('miningTax.overview.emptyHint')}
            />
          ) : (
            <>
              <p className="text-xs text-text-dim">
                {[basisSummary(t, basis, buybackRate), basisUsage(t, basis, daysBySource)]
                  .filter(Boolean)
                  .join(' ')}
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Panel>
                  <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                    {t('miningTax.overview.totalValueStat')}
                  </p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">
                    <IskAmount value={totals.rawValue} revealOn="tap" decimals={0} />
                  </p>
                  {showRefining && (
                    <p className="text-[0.6875rem] text-text-dim">
                      {t('miningTax.overview.totalValueRefinedSubtitle')}{' '}
                      <IskAmount value={totals.refineValue} revealOn="tap" decimals={0} />
                    </p>
                  )}
                </Panel>
                <Panel>
                  <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                    {t('miningTax.overview.iskPerHourStat')}
                  </p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">
                    {totals.iskPerHour !== null ? (
                      <IskAmount value={totals.iskPerHour} revealOn="tap" decimals={0} />
                    ) : (
                      '—'
                    )}
                  </p>
                  <p className="text-[0.6875rem] text-text-dim">
                    {t('miningTax.overview.iskPerHourBasisHint')}
                  </p>
                </Panel>
                <Panel>
                  <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                    {t('miningTax.overview.volumeStat')}
                  </p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">
                    {volumeDisplayMode(totals.volume).kind === 'complete'
                      ? `${formatVolume(totals.volume.m3)} m³`
                      : volumeDisplayMode(totals.volume).kind === 'unknown'
                        ? '—'
                        : `≈ ${formatVolume(totals.volume.m3)} m³`}
                  </p>
                  {volumeDisplayMode(totals.volume).kind === 'partial' && (
                    <p className="text-[0.6875rem] text-warning">
                      {t('miningTax.overview.volumeStatWarning', {
                        count: totals.volume.missingTypeIds.length,
                      })}
                    </p>
                  )}
                </Panel>
                <Panel>
                  <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                    {t('miningTax.overview.daysMinedStat')}
                  </p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">
                    {t('miningTax.overview.daysCoveredValue', {
                      count: coverage.daysWithData,
                      total: coverage.rangeDays,
                    })}
                  </p>
                  {coverage.historyStartsInRange ? (
                    <p className="text-[0.6875rem] text-warning">
                      {t('miningTax.overview.historyStartsHint', {
                        date: coverage.historyStartsInRange,
                      })}
                    </p>
                  ) : (
                    <p className="text-[0.6875rem] text-text-dim">{dateRangeLabel(totals.dates)}</p>
                  )}
                </Panel>
              </div>

              {/* The charts draw their own two cards. */}
              <Suspense
                fallback={
                  <Panel padded>
                    <div className="flex justify-center py-8">
                      <Spinner label={t('common.loading')} />
                    </div>
                  </Panel>
                }
              >
                <LazyMiningYieldCharts
                  dailyRate={dailyRate}
                  typeComparison={typeComparison}
                  showRefining={showRefining}
                />
              </Suspense>

              <Panel
                padded={false}
                actions={
                  <ColumnPickerMenu
                    available={availableColumnIds}
                    visible={activeColumnIds}
                    columnsById={columnsById}
                    onToggle={handleToggleColumn}
                    onReset={handleResetColumns}
                    buttonLabel={t('miningTax.overview.columnsButton')}
                    menuTitle={t('miningTax.overview.columnsMenuTitle')}
                    resetLabel={t('miningTax.overview.resetColumnsAction')}
                  />
                }
              >
                <div className="overflow-x-auto">
                  <DataTable
                    columns={columns}
                    rows={visibleRows}
                    rowKey={(row) =>
                      `${row.characterId}:${row.entry.date}:${row.entry.solarSystemId}`
                    }
                    label={t('miningTax.overviewTab')}
                    stackLayout="dense"
                    {...overviewSort}
                    onRowClick={(row) => setDetailRow(row)}
                  />
                </div>
              </Panel>
            </>
          )}
        </>
      )}

      {detailRow && (
        <YieldDetailModal
          open
          onClose={() => setDetailRow(null)}
          row={detailRow}
          systemName={systemName(detailRow)}
          systemSecurity={data?.systemSecurity.get(detailRow.entry.solarSystemId) ?? null}
          typeNames={data?.typeNames ?? new Map()}
          typeVolumes={data?.typeVolumes ?? new Map()}
          showRefining={showRefining}
        />
      )}
    </div>
  );
}
