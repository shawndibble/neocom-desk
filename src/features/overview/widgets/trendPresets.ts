/**
 * The Gallery's Item prices presets: each adds an ordinary Item prices widget
 * (kind `marketTrend`) that already names its items (`trendItems`), a title and
 * a view. Minerals, ores and the rest come from the Items menu, so they have no
 * preset. Nothing ties the widget to its preset afterwards, so instances stay
 * independent and the pilot can edit the items, title and view like any other.
 */
import type { WidgetView } from './layout';

export type TrendPresetId = 'plex' | 'injector';

export interface TrendPreset {
  id: TrendPresetId;
  /** Type ids (at most TREND_MAX_SERIES). */
  items: readonly number[];
  /** Trade Hub ids; absent means the pilot's Market hub (or global, for PLEX). */
  trendHubs?: readonly string[];
  view: WidgetView;
}

export const TREND_PRESETS: readonly TrendPreset[] = [
  { id: 'plex', items: [44992], view: 'chart' },
  { id: 'injector', items: [40520], view: 'chart' },
];
