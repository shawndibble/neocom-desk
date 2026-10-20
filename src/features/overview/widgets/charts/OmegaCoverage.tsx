/**
 * The Omega coverage widget's chart. Recharts is a chunk of its own, so — like
 * the Mining survey widget's — it arrives by `import()` and Overview's shell
 * never carries it.
 */
import { Suspense } from 'react';
import type { WidgetSize } from '../kinds';
import type { OmegaChartModel } from './types';
import { lazyNamed } from '@/app/lazyNamed';

const LazyChart = lazyNamed(() => import('./OmegaCoverageChart'), 'OmegaCoverageChart');

/** Chart height in px per size, room for the x-axis band and the lines' labels. */
const HEIGHT: Record<WidgetSize, number> = { S: 110, M: 150, L: 180, F: 200 };

export function OmegaCoverage({ model, size }: { model: OmegaChartModel; size: WidgetSize }) {
  return (
    <Suspense fallback={<div style={{ height: HEIGHT[size] }} />}>
      <LazyChart model={model} height={HEIGHT[size]} />
    </Suspense>
  );
}
