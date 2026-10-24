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
  view: WidgetView;
}

export const TREND_PRESETS: readonly TrendPreset[] = [
  { id: 'plex', items: [44992], view: 'chart' },
  { id: 'injector', items: [40520], view: 'chart' },
  // Tritanium .. Zydrine; Megacyte and Morphite do not fit under the six-line cap.
  { id: 'minerals', items: [34, 35, 36, 37, 38, 39], view: 'chart' },
  // Veldspar, Scordite, Pyroxeres, Plagioclase, Omber, Kernite.
  { id: 'ore', items: [1230, 1228, 1224, 18, 1227, 20], view: 'chart' },
];

export function trendPreset(id: string): TrendPreset | undefined {
  return TREND_PRESETS.find((p) => p.id === id);
}
