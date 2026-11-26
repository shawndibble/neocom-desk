import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { guarded } from '@/app/routeChunks';
import { useTranslation } from 'react-i18next';
import {
  EmptyState,
  IskAmount,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  CachedNotice,
} from '@/components/ui';
import { cx } from '@/lib/cx';
import { useNow } from '@/lib/useNow';
import { formatMeanCount, formatVolume } from './format';
import { loadPriceHistory } from './priceHistory';
import {
  filterPriceHistoryRange,
  orderCountWindowDays,
  summarizePriceHistory,
  movingAverage,
  PRICE_HISTORY_RANGES,
  type MarketHistoryPoint,
  type PriceHistoryRange,
} from '@/engine/market/priceHistory';
import { normalizeCompareRegions } from '@/engine/market/priceHistoryCompare';
import {
  clipOpenPrices,
  openPricePoints,
  PRICE_SERIES_CHOICES,
  seriesShows,
  summarizeOpenPrices,
  type PriceSeriesChoice,
  type RegionOpenSeries,
} from '@/engine/market/priceHistoryOpen';
import { loadMarketOpenPrices, type HubOpenPrices } from './marketOpenPrices';
import { TRADE_HUBS } from '@/market/hubs';
import { seriesChoiceLabel } from './priceHistoryLabels';
import { usePriceHistoryRange } from './priceHistoryRangePref';
import { usePriceHistorySeries } from './priceHistorySeriesPref';
import { marketIskDecimals } from '@/lib/isk';
import type { MarketRegionEntry } from '@/sde/marketTypes';
import type { ComparedRegionSeries } from './PriceHistoryChart';
import { CompareRegionsPicker } from './CompareRegionsPicker';
import { useHydratedStore } from '@/lib/useHydratedStore';

const MOVING_AVERAGE_WINDOW_DAYS = 7;
const MOVING_AVERAGE_WINDOW_DAYS_7D_RANGE = 3;

function movingAverageWindowDays(range: PriceHistoryRange): number {
  return range === '7d' ? MOVING_AVERAGE_WINDOW_DAYS_7D_RANGE : MOVING_AVERAGE_WINDOW_DAYS;
}

const LazyPriceHistoryChart = lazy(() => guarded(() => import('./PriceHistoryChart')));

export interface PriceHistoryCompare {
  regionIds: readonly number[];
  onChange: (next: number[]) => void;
  regions: readonly MarketRegionEntry[];
  picksPrimary?: boolean;
}

interface PriceHistoryPanelProps {
  regionId: number;
  typeId: number;
  itemName: string;
  now?: Date;
  compare?: PriceHistoryCompare;
}

type RegionHistoryState =
  | { status: 'loading' }
  | { status: 'error' }
  | {
      status: 'ready';
      points: readonly MarketHistoryPoint[];
      cachedAt: number | null;
    };

const NO_REGIONS: readonly number[] = [];

function regionNameOf(regions: readonly MarketRegionEntry[] | undefined, id: number): string {
  return regions?.find((region) => region.id === id)?.name ?? String(id);
}

function useComparedHistories(typeId: number, regionIds: readonly number[]) {
  const [byKey, setByKey] = useState<ReadonlyMap<string, RegionHistoryState>>(new Map());
  const requested = useRef(new Set<string>());
  useEffect(() => {
    for (const regionId of regionIds) {
      const key = `${regionId}:${typeId}`;
      if (requested.current.has(key)) continue;
      requested.current.add(key);
      loadPriceHistory(regionId, typeId).then(
        (result) =>
          setByKey((prev) =>
            new Map(prev).set(key, {
              status: 'ready',
              points: result.points,
              cachedAt: result.fromCache ? result.fetchedAt : null,
            })
          ),
        () => {
          requested.current.delete(key);
          setByKey((prev) => new Map(prev).set(key, { status: 'error' }));
        }
      );
    }
  }, [typeId, regionIds]);
  return useMemo(
    () =>
      regionIds.map(
        (regionId): RegionHistoryState =>
          byKey.get(`${regionId}:${typeId}`) ?? { status: 'loading' }
      ),
    [byKey, regionIds, typeId]
  );
}

function useOpenSeries(typeId: number, regionIds: readonly number[]) {
  const [byKey, setByKey] = useState<ReadonlyMap<string, HubOpenPrices | null>>(new Map());
  const requested = useRef(new Set<string>());
  useEffect(() => {
    for (const regionId of regionIds) {
      const key = `${regionId}:${typeId}`;
      if (requested.current.has(key)) continue;
      requested.current.add(key);
      void loadMarketOpenPrices(regionId, typeId).then((series) =>
        setByKey((prev) => new Map(prev).set(key, series))
      );
    }
  }, [typeId, regionIds]);
  return useMemo(() => {
    const series = new Map<number, HubOpenPrices>();
    const missing = new Set<number>();
    for (const regionId of regionIds) {
      const key = `${regionId}:${typeId}`;
      if (!byKey.has(key)) continue;
      const stored = byKey.get(key);
      if (stored) series.set(regionId, stored);
      else missing.add(regionId);
    }
    return { series, missing };
  }, [byKey, regionIds, typeId]);
}

function ChartFallback({ label }: { label: string }) {
  return <Spinner block="panel" label={label} />;
}

export function PriceHistoryPanel({
  regionId,
  typeId,
  itemName,
  now: nowProp,
  compare,
}: PriceHistoryPanelProps) {
  const { t } = useTranslation();
  const tick = useNow();
  const now = useMemo(() => nowProp ?? new Date(tick), [nowProp, tick]);
  const compareIds = useMemo(
    () => normalizeCompareRegions(compare?.regionIds ?? NO_REGIONS, regionId),
    [compare?.regionIds, regionId]
  );
  const [points, setPoints] = useState<MarketHistoryPoint[] | null>(null);
  const [primaryCachedAt, setPrimaryCachedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const comparedHistories = useComparedHistories(
    typeId,
    points && points.length > 0 ? compareIds : NO_REGIONS
  );
  const openRegionIds = useMemo(() => [regionId, ...compareIds], [regionId, compareIds]);
  const { series: openSeries, missing: openMissing } = useOpenSeries(typeId, openRegionIds);
  const range = usePriceHistoryRange((state) => state.value);
  const setRange = usePriceHistoryRange((state) => state.setValue);
  useHydratedStore(usePriceHistoryRange);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setPoints(null);
      setPrimaryCachedAt(null);
      setError(false);
      try {
        const result = await loadPriceHistory(regionId, typeId);
        if (!cancelled) {
          setPoints(result.points);
          setPrimaryCachedAt(result.fromCache ? result.fetchedAt : null);
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [regionId, typeId]);

  const cachedAt = comparedHistories.reduce<number | null>(
    (oldest, state) =>
      state.status === 'ready' &&
      state.cachedAt !== null &&
      (oldest === null || state.cachedAt < oldest)
        ? state.cachedAt
        : oldest,
    primaryCachedAt
  );

  if (loading) return <ChartFallback label={t('common.loading')} />;

  if (error) {
    return (
      <EmptyState
        title={t('market.priceHistory.errorTitle')}
        hint={t('market.priceHistory.errorHint')}
        className="py-8"
      />
    );
  }

  if (!points || points.length === 0) {
    return (
      <EmptyState
        title={t('market.priceHistory.emptyTitle')}
        hint={t('market.priceHistory.emptyHint')}
        className="py-8"
      />
    );
  }

  return (
    <>
      {cachedAt !== null && <CachedNotice className="px-1 pt-2" fetchedAt={cachedAt} />}
      <RangedHistory
        points={points}
        range={range}
        onRangeChange={(next) => void setRange(next)}
        itemName={itemName}
        now={now}
        primaryRegionId={regionId}
        compare={compare}
        compareIds={compareIds}
        comparedHistories={comparedHistories}
        openSeries={openSeries}
        openMissing={openMissing}
      />
    </>
  );
}

function Stat({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={cx('flex items-baseline gap-1.5', className)}>
      <span className="text-text-dim">{label}</span>
      {children}
    </span>
  );
}

interface RangedHistoryProps {
  points: readonly MarketHistoryPoint[];
  range: PriceHistoryRange;
  onRangeChange: (range: PriceHistoryRange) => void;
  itemName: string;
  now: Date;
  primaryRegionId: number;
  compare: PriceHistoryCompare | undefined;
  compareIds: readonly number[];
  comparedHistories: readonly RegionHistoryState[];
  openSeries: ReadonlyMap<number, HubOpenPrices>;
  openMissing: ReadonlySet<number>;
}

function RangedHistory({
  points,
  range,
  onRangeChange,
  itemName,
  now,
  primaryRegionId,
  compare,
  compareIds,
  comparedHistories,
  openSeries,
  openMissing,
}: RangedHistoryProps) {
  const { t } = useTranslation();
  const series = usePriceHistorySeries((state) => state.value);
  const setSeries = usePriceHistorySeries((state) => state.setValue);
  useHydratedStore(usePriceHistorySeries);
  const openPrices = useMemo<RegionOpenSeries[]>(
    () =>
      [...openSeries.entries()]
        .map(([regionId, stored]) => ({
          regionId,
          station: TRADE_HUBS.find((hub) => hub.stationId === stored.stationId)?.stationLabel,
          points: clipOpenPrices(openPricePoints(stored.series), range, now),
        }))
        .filter((o) => o.points.length > 0),
    [openSeries, range, now]
  );
  const primaryOpen = useMemo(
    () => openPrices.find((o) => o.regionId === primaryRegionId),
    [openPrices, primaryRegionId]
  );
  const openSummary = useMemo(
    () => (primaryOpen ? summarizeOpenPrices(primaryOpen.points) : null),
    [primaryOpen]
  );
  const regions = compare?.regions;
  const comparisons = useMemo<ComparedRegionSeries[]>(
    () =>
      compareIds.map((regionId, i) => {
        const state = comparedHistories[i] ?? { status: 'loading' };
        return {
          regionId,
          name: regionNameOf(regions, regionId),
          status: state.status,
          points: state.status === 'ready' ? filterPriceHistoryRange(state.points, range, now) : [],
        };
      }),
    [compareIds, comparedHistories, regions, range, now]
  );
  const filtered = useMemo(() => filterPriceHistoryRange(points, range, now), [points, range, now]);
  const summary = useMemo(
    () =>
      summarizePriceHistory(
        filtered,
        points.length > 0 ? orderCountWindowDays(range, points[0].date, now) : 1
      ),
    [filtered, points, range, now]
  );
  const filteredMovingAverage = useMemo(() => {
    const windowDays = movingAverageWindowDays(range);
    const fullMovingAverage = movingAverage(points, windowDays);
    return filterPriceHistoryRange(fullMovingAverage, range, now);
  }, [points, range, now]);

  return (
    <div>
      <div className="flex flex-col gap-2 px-1 pt-2 pb-2">
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:flex sm:flex-wrap sm:gap-x-4">
          {summary ? (
            <>
              <Stat label={t('market.priceHistory.summaryHi')}>
                <IskAmount value={summary.hi} decimals={marketIskDecimals(summary.hi)} />
              </Stat>
              <Stat label={t('market.priceHistory.summaryLo')}>
                <IskAmount value={summary.lo} decimals={marketIskDecimals(summary.lo)} />
              </Stat>
              <Stat label={t('market.priceHistory.summaryMedian')}>
                <IskAmount value={summary.median} decimals={marketIskDecimals(summary.median)} />
              </Stat>
              {typeof openSummary?.buyMedian === 'number' && seriesShows(series, 'buy') && (
                <Stat label={t('market.priceHistory.summaryBuyMedian')}>
                  <IskAmount
                    value={openSummary.buyMedian}
                    decimals={marketIskDecimals(openSummary.buyMedian)}
                  />
                </Stat>
              )}
              {typeof openSummary?.sellMedian === 'number' && seriesShows(series, 'sell') && (
                <Stat label={t('market.priceHistory.summarySellMedian')}>
                  <IskAmount
                    value={openSummary.sellMedian}
                    decimals={marketIskDecimals(openSummary.sellMedian)}
                  />
                </Stat>
              )}
              <Stat label={t('market.priceHistory.summaryOrdersPerDay')}>
                <span className="tabular-nums">{formatMeanCount(summary.meanOrderCount)}</span>
              </Stat>
              <Stat
                label={t('market.priceHistory.summaryVolume')}
                className="col-span-2 sm:col-auto"
              >
                <span className="tabular-nums">{formatVolume(summary.totalVolume)}</span>
              </Stat>
            </>
          ) : (
            <span className="text-text-dim">{t('market.priceHistory.summaryNone')}</span>
          )}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          {compare && (
            <CompareRegionsPicker
              primaryRegionId={compare.picksPrimary ? 0 : primaryRegionId}
              selected={compare.picksPrimary ? [primaryRegionId, ...compareIds] : compareIds}
              required={compare.picksPrimary}
              onChange={compare.onChange}
              regions={compare.regions}
              className="w-full sm:w-auto"
            />
          )}
          <Select
            value={series}
            onValueChange={(value) => void setSeries(value as PriceSeriesChoice)}
          >
            <SelectTrigger
              size="md"
              aria-label={t('market.priceHistory.series')}
              className="w-full sm:w-32"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRICE_SERIES_CHOICES.map((choice) => (
                <SelectItem key={choice} value={choice}>
                  {seriesChoiceLabel(t, choice)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={range}
            onValueChange={(value) => onRangeChange(value as PriceHistoryRange)}
          >
            <SelectTrigger
              size="md"
              aria-label={t('market.priceHistory.range')}
              className="w-full sm:w-28"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRICE_HISTORY_RANGES.map((r) => (
                <SelectItem key={r} value={r}>
                  {t(`market.priceHistory.range${r}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Suspense fallback={<ChartFallback label={t('common.loading')} />}>
        <LazyPriceHistoryChart
          points={filtered}
          itemName={itemName}
          movingAverage={filteredMovingAverage}
          comparisons={comparisons}
          primaryRegionName={regions ? regionNameOf(regions, primaryRegionId) : undefined}
          primaryRegionId={primaryRegionId}
          openPrices={openPrices}
          series={series}
          openMissing={openMissing}
        />
      </Suspense>
    </div>
  );
}
