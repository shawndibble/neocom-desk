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
import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataAgeBadge,
  DataTable,
  EmptyState,
  IconButton,
  IskAmount,
  PageHeader,
  Panel,
  Spinner,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { beginEveLogin } from '@/app/loginFlow';
import { useRouteSnapshot } from '@/lib/useRouteSnapshot';
import { formatVolume } from '@/features/market/format';
import { CharacterFilterControl } from '@/features/character/CharacterFilterControl';
import {
  useResolvedCharacterFilter,
  type CharacterFilterValue,
} from '@/features/character/characterFilterValue';
import { SecurityValue } from '@/features/character/assetBrowserRows';
import {
  loadMiningYieldSnapshot,
  type MiningYieldRow,
  type MiningYieldSnapshot,
} from './yieldSnapshot';
import { iskPerCalendarHour } from '@/engine/miningTax/yieldRate';
import {
  MINING_YIELD_RANGES,
  daysCovered,
  eveToday,
  rangeDates,
  rangeStartDate,
  type MiningYieldRange,
} from '@/engine/miningTax/yieldRange';
import { useMiningYieldRange } from './yieldRangePref';
import { YieldDetailModal } from './YieldDetailModal';
import { sumVolume, volumeDisplayMode } from './volume';
import { VolumeDisplay } from './volumeDisplay';
import type { DailyRatePoint, TypeComparisonPoint } from './MiningYieldCharts';

const LazyMiningYieldCharts = lazy(() => import('./MiningYieldCharts'));

/**
 * Ignores both arguments `useRouteSnapshot` passes — this view isn't scoped
 * to the active Character (every tracked Character, same as the Tax tab) and
 * `loadMiningYieldSnapshot` has no mid-flight cancellation checkpoint to gate
 * on `signal`.
 */
function loadSnapshot(): Promise<MiningYieldSnapshot> {
  return loadMiningYieldSnapshot();
}

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

interface RangeControlProps {
  value: MiningYieldRange;
  onChange: (range: MiningYieldRange) => void;
  /** Full width with 44px tap targets — the phone layout. */
  fill?: boolean;
}

/** Segmented Date range buttons. Each range slices already-loaded rows, so switching never refetches. */
function RangeControl({ value, onChange, fill = false }: RangeControlProps) {
  const { t } = useTranslation();
  return (
    <div
      role="group"
      aria-label={t('miningTax.overview.dateRangeStat')}
      className={`flex overflow-hidden rounded-xs border border-line ${fill ? 'w-full' : ''}`}
    >
      {MINING_YIELD_RANGES.map((range) => {
        const active = range === value;
        return (
          <button
            key={range}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(range)}
            className={`border-r border-line px-3 text-xs last:border-r-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${fill ? 'h-11 flex-1' : 'h-8'} ${active ? 'bg-panel-2 text-accent shadow-[inset_0_-2px_0_var(--color-accent)]' : 'text-text-dim hover:text-text'}`}
          >
            {t(`miningTax.overview.range.${range}`)}
          </button>
        );
      })}
    </div>
  );
}

interface OverviewTabProps {
  /** The route's shared tab bar, rendered under this tab's own `PageHeader`. See `MoonMiningTax`. */
  tabBar: ReactNode;
}

export function OverviewTab({ tabBar }: OverviewTabProps) {
  const { t } = useTranslation();
  const { data, error, loading, activeCharacterId, refresh } = useRouteSnapshot(
    loadSnapshot,
    undefined,
    { cacheKey: 'miningYieldOverview' }
  );

  const [characterFilter, setCharacterFilter] = useState<CharacterFilterValue>('all');
  const [detailRow, setDetailRow] = useState<MiningYieldRow | null>(null);
  const resolvedCharacterFilter = useResolvedCharacterFilter(characterFilter, activeCharacterId);
  const range = useMiningYieldRange((state) => state.value);
  const setRange = useMiningYieldRange((state) => state.setValue);
  const hydrateRange = useMiningYieldRange((state) => state.hydrate);
  useEffect(() => {
    void hydrateRange();
  }, [hydrateRange]);
  // EVE/UTC, the ledger's own calendar. Recomputed each render so a tab left
  // open past downtime moves its window with the day.
  const today = eveToday();

  const characters = data?.characters ?? [];
  const showCharacterColumn = characters.length > 1;

  const characterRows = useMemo(
    () =>
      (data?.rows ?? []).filter(
        (row) => resolvedCharacterFilter === 'all' || resolvedCharacterFilter.has(row.characterId)
      ),
    [data, resolvedCharacterFilter]
  );
  const visibleRows = useMemo(() => {
    const start = rangeStartDate(range, today);
    return characterRows.filter((row) => row.entry.date >= start && row.entry.date <= today);
  }, [characterRows, range, today]);
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

  const dailyRate: DailyRatePoint[] = useMemo(() => {
    const byDate = new Map<string, number>();
    for (const row of visibleRows) {
      byDate.set(row.entry.date, (byDate.get(row.entry.date) ?? 0) + row.valuation.rawValue);
    }
    // Every day of the range, mined or not, so the axis spans the whole window
    // and a gap (or days before saved history began) reads as a gap.
    return rangeDates(range, today).map((date) => ({
      date,
      iskPerHour: (byDate.get(date) ?? 0) / 24,
    }));
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
    return [...byType.entries()]
      .map(([typeId, values]) => ({
        typeId,
        typeName: data?.typeNames.get(typeId) ?? `#${typeId}`,
        ...values,
      }))
      .sort((a, b) => b.rawValue + b.refineValue - (a.rawValue + a.refineValue))
      .slice(0, 12);
  }, [visibleRows, data]);

  function systemName(row: MiningYieldRow): string {
    return data?.systemNames.get(row.entry.solarSystemId) ?? `#${row.entry.solarSystemId}`;
  }

  const columns: DataTableColumn<MiningYieldRow>[] = [
    ...(showCharacterColumn
      ? [
          {
            id: 'character',
            header: t('miningTax.characterColumn'),
            render: (row: MiningYieldRow) => row.characterName,
            sortValue: (row: MiningYieldRow) => row.characterName,
          } satisfies DataTableColumn<MiningYieldRow>,
        ]
      : []),
    {
      id: 'date',
      header: t('miningTax.dateColumn'),
      headerTooltip: t('miningTax.dateEveHint'),
      render: (row) => row.entry.date,
      sortValue: (row) => row.entry.date,
      primary: true,
    },
    {
      id: 'system',
      header: t('miningTax.systemColumn'),
      render: (row) => (
        <span className="flex items-center gap-1.5">
          {systemName(row)}
          <SecurityValue security={data?.systemSecurity.get(row.entry.solarSystemId)} t={t} />
        </span>
      ),
      sortValue: (row) => systemName(row),
    },
    {
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
    },
    {
      id: 'rawValue',
      header: t('miningTax.overview.rawSellValue'),
      align: 'right',
      className: 'whitespace-nowrap',
      render: (row) => <IskAmount value={row.valuation.rawValue} revealOn="tap" decimals={0} />,
      sortValue: (row) => row.valuation.rawValue,
    },
    {
      id: 'refineValue',
      header: t('miningTax.overview.refineValue'),
      align: 'right',
      className: 'whitespace-nowrap',
      render: (row) => <IskAmount value={row.valuation.refineValue} revealOn="tap" decimals={0} />,
      sortValue: (row) => row.valuation.refineValue,
    },
    {
      id: 'pricing',
      header: t('miningTax.overview.pricingColumn'),
      className: 'whitespace-nowrap',
      cellClassName: (row) => (row.valuation.pricedAll ? 'text-text-dim' : 'text-warning'),
      render: (row) =>
        row.valuation.pricedAll
          ? t('miningTax.overview.pricingFull')
          : t('miningTax.overview.pricingPartial'),
      sortValue: (row) => (row.valuation.pricedAll ? 1 : 0),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Same shape as `TaxTab`: this tab owns its snapshot, so it owns the
          header whose actions drive it. */}
      <PageHeader
        title={t('miningTax.title')}
        meta={data?.fetchedAt ? <DataAgeBadge date={data.fetchedAt} /> : undefined}
        actions={
          <>
            <div className="hidden sm:flex">
              <RangeControl value={range} onChange={(next) => void setRange(next)} />
            </div>
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
      <div className="sm:hidden">
        <RangeControl value={range} onChange={(next) => void setRange(next)} fill />
      </div>

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
                      onClick={() => void beginEveLogin({ characterId: c.characterId })}
                    >
                      {t('miningTax.reauthAction')}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {visibleRows.length === 0 ? (
            <EmptyState
              title={t('miningTax.overview.emptyTitle')}
              hint={t('miningTax.overview.emptyHint')}
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Panel>
                  <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                    {t('miningTax.overview.totalValueStat')}
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">
                    <IskAmount value={totals.rawValue} revealOn="tap" decimals={0} />
                  </p>
                </Panel>
                <Panel>
                  <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                    {t('miningTax.overview.iskPerHourStat')}
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">
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
                  <p className="mt-1 text-lg font-semibold tabular-nums">
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
                    {t('miningTax.overview.daysCoveredStat')}
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">
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

              <Panel padded>
                <Suspense
                  fallback={
                    <div className="flex justify-center py-8">
                      <Spinner label={t('common.loading')} />
                    </div>
                  }
                >
                  <LazyMiningYieldCharts dailyRate={dailyRate} typeComparison={typeComparison} />
                </Suspense>
              </Panel>

              <Panel padded={false}>
                <div className="overflow-x-auto">
                  <DataTable
                    columns={columns}
                    rows={visibleRows}
                    rowKey={(row) =>
                      `${row.characterId}:${row.entry.date}:${row.entry.solarSystemId}`
                    }
                    label={t('miningTax.overviewTab')}
                    defaultSort={{ columnId: 'date', direction: 'desc' }}
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
        />
      )}
    </div>
  );
}
