import { Suspense } from 'react';
import type { SurveySummary } from '@/engine/survey/series';
import type { WidgetSize } from '../kinds';
import { lazyNamed } from '@/app/lazyNamed';

const LazySurveyCharts = lazyNamed(() => import('@/features/survey/SurveyCharts'), 'SurveyCharts');

const HEIGHT: Record<WidgetSize, number> = { S: 110, M: 140, L: 170, F: 190 };

export function SurveyVolume({ summary, size }: { summary: SurveySummary; size: WidgetSize }) {
  return (
    <Suspense fallback={<div style={{ height: HEIGHT[size] }} />}>
      <LazySurveyCharts summary={summary} compactHeight={HEIGHT[size]} />
    </Suspense>
  );
}
