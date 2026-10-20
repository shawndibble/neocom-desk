/**
 * The Mining survey widget's chart: the Survey tab's own volume chart, smaller.
 * Recharts is a chunk of its own, so — as on the Survey tab — it arrives by
 * `import()` and Overview's shell never carries it.
 */
import { Suspense } from 'react';
import type { SurveySummary } from '@/engine/survey/series';
import type { WidgetSize } from '../kinds';
import { lazyNamed } from '@/app/lazyNamed';

const LazySurveyCharts = lazyNamed(() => import('@/features/survey/SurveyCharts'), 'SurveyCharts');

/** Chart height in px per size; taller than the other widget charts, which have no time axis to read. */
const HEIGHT: Record<WidgetSize, number> = { S: 110, M: 140, L: 170, F: 190 };

export function SurveyVolume({ summary, size }: { summary: SurveySummary; size: WidgetSize }) {
  return (
    <Suspense fallback={<div style={{ height: HEIGHT[size] }} />}>
      <LazySurveyCharts summary={summary} compactHeight={HEIGHT[size]} />
    </Suspense>
  );
}
