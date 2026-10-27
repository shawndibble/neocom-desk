/**
 * Device-local: which quantity the Mining Yield Overview's two charts plot —
 * ISK (today's only option), mined m³, or item count (issue #2160). Local,
 * not synced, same as `showRefiningPref.ts`: this is about how this device's
 * owner reads the page, not a fact about the pilot.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';

export const CHART_METRICS = ['isk', 'volume', 'count'] as const;
export type ChartMetric = (typeof CHART_METRICS)[number];

export const MINING_CHART_METRIC_KEY = 'miningYieldChartMetric';

function isChartMetric(raw: unknown): raw is ChartMetric {
  return CHART_METRICS.includes(raw as ChartMetric);
}

export const useMiningChartMetric = createLocalSetting<ChartMetric>({
  key: MINING_CHART_METRIC_KEY,
  defaultValue: 'isk',
  parse: (raw) => (isChartMetric(raw) ? raw : null),
});
