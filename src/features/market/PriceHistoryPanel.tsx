import { lazy, Suspense, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState, Spinner } from '@/components/ui';
import { loadPriceHistory } from './priceHistory';
import type { MarketHistoryPoint } from '@/engine/market/priceHistory';

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
}

function ChartFallback({ label }: { label: string }) {
  return (
    <div className="flex justify-center py-8">
      <Spinner label={label} />
    </div>
  );
}

/** Price History tab body: fetches the region's daily history for the item, then hands it to the lazy chart. */
export function PriceHistoryPanel({ regionId, typeId, itemName }: PriceHistoryPanelProps) {
  const { t } = useTranslation();
  const [points, setPoints] = useState<MarketHistoryPoint[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setPoints(null);
      try {
        const result = await loadPriceHistory(regionId, typeId);
        if (!cancelled) setPoints(result.points);
      } catch {
        if (!cancelled) setPoints([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [regionId, typeId]);

  if (loading) return <ChartFallback label={t('common.loading')} />;

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
    <Suspense fallback={<ChartFallback label={t('common.loading')} />}>
      <LazyPriceHistoryChart points={points} itemName={itemName} />
    </Suspense>
  );
}
