/** How much of a chart each widget size shows. */
import type { WidgetSize } from '../kinds';
import type { ChartModel } from './types';

/** Rows an HBars / Sparklines chart shows per size. */
export const hbarRows = (size: WidgetSize): number => (size === 'S' ? 3 : 6);
export const sparkRows = (size: WidgetSize): number => (size === 'S' ? 2 : 4);
export const donutSize = (size: WidgetSize): number => (size === 'S' ? 72 : 96);

/**
 * Whether the Number view may carry this chart under its figure. A donut is
 * the headline's own breakdown and needs room, so it only appears in the
 * Chart view (the mockup's rule).
 */
export const showsInNumberView = (model: ChartModel): boolean => model.kind !== 'donut';
