import type { WidgetView } from './layout';

export type TrendPresetId = 'plex' | 'injector';

export interface TrendPreset {
  id: TrendPresetId;
  items: readonly number[];
  trendHubs?: readonly string[];
  view: WidgetView;
}

export const TREND_PRESETS: readonly TrendPreset[] = [
  { id: 'plex', items: [44992], view: 'chart' },
  { id: 'injector', items: [40520], view: 'chart' },
];
