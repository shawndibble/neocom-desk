import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  EmptyState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
} from '@/components/ui';
import { loadPriceHistory } from './priceHistory';
import { formatIsk } from '@/lib/isk';
import {
  filterPriceHistoryRange,
  summarizePriceHistory,
  PRICE_HISTORY_RANGES,
  type MarketHistoryPoint,
  type PriceHistoryRange,
} from '@/engine/market/priceHistory';

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
  const [range, setRange] = useState<PriceHistoryRange>('30d');
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
      onRangeChange={setRange}
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

  return (
    <div>
      <div className="flex items-center justify-between gap-2 px-1 pb-2">
        <div className="flex gap-3 text-xs">
          {summary ? (
            <>
              <span>
                {t('market.priceHistory.summaryHi')}: {formatIsk(summary.hi, 2)}
              </span>
              <span>
                {t('market.priceHistory.summaryLo')}: {formatIsk(summary.lo, 2)}
              </span>
              <span>
                {t('market.priceHistory.summaryMedian')}: {formatIsk(summary.median, 2)}
              </span>
            </>
          ) : (
            // Distinct from emptyTitle above (ESI has no history at all) — this
            // item has history, just none inside the currently selected range.
            <span className="text-text-dim">{t('market.priceHistory.summaryNone')}</span>
          )}
        </div>
        <Select value={range} onValueChange={(value) => onRangeChange(value as PriceHistoryRange)}>
          <SelectTrigger size="sm" aria-label={t('market.priceHistory.range')} className="w-28">
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
        <LazyPriceHistoryChart points={filtered} itemName={itemName} />
      </Suspense>
    </div>
  );
}
