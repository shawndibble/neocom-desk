import type { WidgetSize } from '../kinds';

export const hbarRows = (size: WidgetSize): number => (size === 'S' ? 3 : 6);
export const sparkRows = (size: WidgetSize): number => (size === 'S' ? 2 : 4);
export const donutSize = (size: WidgetSize): number => (size === 'S' ? 72 : 96);
export const ganttRows = (size: WidgetSize): number =>
  size === 'S' ? 3 : size === 'M' ? 5 : size === 'L' ? 8 : 10;
