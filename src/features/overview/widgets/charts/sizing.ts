/** How much of a chart each widget size shows. */
import type { WidgetSize } from '../kinds';

/** Rows an HBars / Sparklines chart shows per size. */
export const hbarRows = (size: WidgetSize): number => (size === 'S' ? 3 : 6);
export const sparkRows = (size: WidgetSize): number => (size === 'S' ? 2 : 4);
export const donutSize = (size: WidgetSize): number => (size === 'S' ? 72 : 96);
/** Rows a Gantt shows per size; Small draws its progress-bar fallback instead. */
export const ganttRows = (size: WidgetSize): number =>
  size === 'S' ? 3 : size === 'M' ? 5 : size === 'L' ? 8 : 10;
