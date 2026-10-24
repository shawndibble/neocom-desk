/**
 * The Gallery's Market Trend presets: each adds an ordinary Market Trend widget
 * that already names its items (`trendItems`), a title and a view. Nothing
 * ties the widget to its preset afterwards, so instances stay independent and
 * the pilot can edit the items, title and view like any other widget.
 */
import type { WidgetView } from './layout';

export type TrendPresetId = 'plex' | 'injector' | 'minerals' | 'ore';

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
  // Tritanium, Pyerite, Mexallon at Jita; the Items dialog adds more.
  { id: 'minerals', items: [34, 35, 36], trendHubs: ['jita'], view: 'chart' },
  // Veldspar, Scordite, Pyroxeres at Jita.
  { id: 'ore', items: [1230, 1228, 1224], trendHubs: ['jita'], view: 'chart' },
];

export function trendPreset(id: string): TrendPreset | undefined {
  return TREND_PRESETS.find((p) => p.id === id);
}
