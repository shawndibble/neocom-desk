/**
 * Draws one chart model at a widget size, and gives it its text equivalent.
 *
 * The drawing is aria-hidden and the model's `summary` is visually hidden
 * text beside it, so a screen reader gets the same figures the eye does (the
 * Table view is the table behind it). Hand-built SVG/CSS on purpose: Overview
 * sits in the signed-in shell chunk, which must never pull in a chart library.
 */
import { cx } from '@/lib/cx';
import type { WidgetSize } from '../kinds';
import { chartHeight } from '../sizes';
import { AreaChart } from './AreaChart';
import { Bars } from './Bars';
import { Donut } from './Donut';
import { Gantt } from './Gantt';
import { HBars } from './HBars';
import { Sparklines } from './Sparklines';
import { StackBar } from './StackBar';
import { StackedArea } from './StackedArea';
import { StackRows } from './StackRows';
import { Lines } from './Lines';
import { OmegaCoverage } from './OmegaCoverage';
import { SurveyVolume } from './SurveyVolume';
import { donutSize, ganttRows, hbarRows, sparkRows } from './sizing';
import type { ChartModel } from './types';

function Drawing({ model, size }: { model: ChartModel; size: WidgetSize }) {
  const height = chartHeight[size];
  switch (model.kind) {
    case 'area':
      return <AreaChart model={model} height={height} />;
    case 'bars':
      return <Bars model={model} height={height} />;
    case 'hbars':
      return <HBars model={model} maxRows={hbarRows(size)} />;
    case 'gantt':
      return size === 'S' ? (
        <HBars model={model.fallback} maxRows={hbarRows(size)} />
      ) : (
        <Gantt model={model} maxRows={ganttRows(size)} />
      );
    case 'donut':
      return <Donut model={model} size={donutSize(size)} />;
    case 'stack':
      return <StackBar model={model} />;
    case 'stackedArea':
      return <StackedArea model={model} height={height} compact={size === 'S'} />;
    case 'stackRows':
      return <StackRows model={model} maxRows={hbarRows(size)} />;
    case 'spark':
      return <Sparklines model={model} maxRows={sparkRows(size)} />;
    case 'omega':
      return <OmegaCoverage model={model} size={size} />;
    case 'lines':
      return <Lines model={model} height={height} />;
    case 'survey':
      return <SurveyVolume summary={model.data} size={size} />;
  }
}

export function Chart({
  model,
  size,
  className,
}: {
  model: ChartModel;
  size: WidgetSize;
  className?: string;
}) {
  return (
    <div data-card-click-ignore className={cx('grid gap-1.5', className)}>
      <Drawing model={model} size={size} />
      {model.note && <p className="text-[0.6875rem] text-text-dim">{model.note}</p>}
      <p className="sr-only">{model.summary}</p>
    </div>
  );
}
