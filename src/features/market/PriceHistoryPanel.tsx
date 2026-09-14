import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
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
} from '@/components/ui';
import { formatMeanCount, formatVolume } from './format';
import { loadPriceHistory } from './priceHistory';
import {
  filterPriceHistoryRange,
  summarizePriceHistory,
  movingAverage,
  PRICE_HISTORY_RANGES,
  type MarketHistoryPoint,
  type PriceHistoryRange,
} from '@/engine/market/priceHistory';
import { usePriceHistoryRange } from './priceHistoryRangePref';

const MOVING_AVERAGE_WINDOW_DAYS = 7;
const MOVING_AVERAGE_WINDOW_DAYS_7D_RANGE = 3;

/**
 * A 7-day window on the 7d range itself collapses to a single point —
 * restating the hi/lo/median summary as a line rather than showing a trend.
 * Use a shorter window there instead of hiding the line entirely.
 */
function movingAverageWindowDays(range: PriceHistoryRange): number {
  return range === '7d' ? MOVING_AVERAGE_WINDOW_DAYS_7D_RANGE : MOVING_AVERAGE_WINDOW_DAYS;
}

/**
 * Dynamic import, not a static one: `PriceHistoryChart.tsx` statically
 * imports Recharts, so this is the boundary that keeps the library out of
 * the initial page bundle — it only loads once the Price History tab is
 * actually opened.
 */
const LazyPriceHistoryChart = lazy(() => import('./PriceHistoryChart'));

interface PriceHistoryPanelProps {
  regionId: number;
  typeId: number;
  itemName: string;
  /** Injectable for tests, like `getOrderBook`'s `Clock` — the range filter is otherwise wall-clock-relative. */
  now?: Date;
}

function ChartFallback({ label }: { label: string }) {
  return (
    <div className="flex justify-center py-8">
      <Spinner label={label} />
    </div>
  );
}

/** Price History tab body: fetches the region's daily history for the item, then hands it to the lazy chart. */
export function PriceHistoryPanel({ regionId, typeId, itemName, now }: PriceHistoryPanelProps) {
  const { t } = useTranslation();
  const [points, setPoints] = useState<MarketHistoryPoint[] | null>(null);
  const [loading, setLoading] = useState(true);
  // The window a trader reads in is a habit, not a property of the item, and
  // this panel remounts per item — so it comes from disk. Ungated on
  // `hydrated`, and hydrated above the early returns below so a loading or
  // empty item still settles it: `loadPriceHistory` fetches the full daily
  // series either way and the range only slices it, so no range costs a
  // request the default would not have spent.
  const range = usePriceHistoryRange((state) => state.value);
  const hydrateRange = usePriceHistoryRange((state) => state.hydrate);
  const setRange = usePriceHistoryRange((state) => state.setValue);
  useEffect(() => {
    void hydrateRange();
  }, [hydrateRange]);
  // Distinct from "no history": a thrown fetch failure (network/rate-limit/5xx)
  // is not the same fact as ESI genuinely having nothing for this item, and
  // folding the two into one EmptyState would misreport failures as data.
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setPoints(null);
      setError(false);
      try {
        const result = await loadPriceHistory(regionId, typeId);
        if (!cancelled) setPoints(result.points);
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
    <RangedHistory
      points={points}
      range={range}
      onRangeChange={(next) => void setRange(next)}
      itemName={itemName}
      now={now}
    />
  );
}

interface RangedHistoryProps {
  points: readonly MarketHistoryPoint[];
  range: PriceHistoryRange;
  onRangeChange: (range: PriceHistoryRange) => void;
  itemName: string;
  now?: Date;
}

/** Range control + hi/lo/median summary, both derived from the already-fetched points — neither needs the lazy chart loaded. */
function RangedHistory({ points, range, onRangeChange, itemName, now }: RangedHistoryProps) {
  const { t } = useTranslation();
  const filtered = useMemo(
    () =>
      now ? filterPriceHistoryRange(points, range, now) : filterPriceHistoryRange(points, range),
    [points, range, now]
  );
  const summary = useMemo(() => summarizePriceHistory(filtered), [filtered]);
  // Computed over the full unfiltered `points`, then sliced to `range` —
  // computing it over `filtered` instead would understate the window for
  // the first days of any range that don't have `windowDays` prior days
  // inside the filtered slice, even though real history for them exists.
  const filteredMovingAverage = useMemo(() => {
    const windowDays = movingAverageWindowDays(range);
    const fullMovingAverage = movingAverage(points, windowDays);
    return filterPriceHistoryRange(fullMovingAverage, range, now);
  }, [points, range, now]);

  return (
    <div>
      {/*
       * Stacked below `sm`, one row above it. Five figures and a select no
       * longer share a phone-width line: on that screen the summary wraps to
       * a couple of rows and the range control takes a full-width one of its
       * own, where it is also a full-height tap target rather than something
       * squeezed against the last number. CSS-only, like `DataTable`'s own
       * collapse — one markup, no duplicated branch.
       */}
      <div className="flex flex-col gap-2 px-1 pb-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {summary ? (
            <>
              <span>
                {t('market.priceHistory.summaryHi')}:{' '}
                <IskAmount value={summary.hi} revealOn="tap" />
              </span>
              <span>
                {t('market.priceHistory.summaryLo')}:{' '}
                <IskAmount value={summary.lo} revealOn="tap" />
              </span>
              <span>
                {t('market.priceHistory.summaryMedian')}:{' '}
                <IskAmount value={summary.median} revealOn="tap" />
              </span>
              {/* Units and orders, not ISK — plain figures, so no `IskAmount`
                  and nothing for its privacy blur to hide. */}
              <span>
                {t('market.priceHistory.summaryVolume')}:{' '}
                <span className="tabular-nums">{formatVolume(summary.totalVolume)}</span>
              </span>
              <span>
                {t('market.priceHistory.summaryOrdersPerDay')}:{' '}
                <span className="tabular-nums">{formatMeanCount(summary.meanOrderCount)}</span>
              </span>
            </>
          ) : (
            // Distinct from emptyTitle above (ESI has no history at all) — this
            // item has history, just none inside the currently selected range.
            <span className="text-text-dim">{t('market.priceHistory.summaryNone')}</span>
          )}
        </div>
        <Select value={range} onValueChange={(value) => onRangeChange(value as PriceHistoryRange)}>
          {/*
           * `md`, not the `sm` this was: DESIGN.md §3's touch tier is the
           * reason — `sm` resolves to 36px on a phone, a mouse-pointer size,
           * and this control now owns a full-width row there rather than
           * sharing a dense one. `md` gives the 44px thumb target on a phone
           * and the default 36px to a pointer. Nothing else sits in this row,
           * so no toolbar loses its alignment to the extra 8px.
           */}
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
      <Suspense fallback={<ChartFallback label={t('common.loading')} />}>
        <LazyPriceHistoryChart
          points={filtered}
          itemName={itemName}
          movingAverage={filteredMovingAverage}
        />
      </Suspense>
    </div>
  );
}
