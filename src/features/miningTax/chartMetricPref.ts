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
