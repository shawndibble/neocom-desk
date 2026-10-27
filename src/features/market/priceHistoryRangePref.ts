/**
 * Device-local: how far back the Price History chart looks.
 *
 * The panel is remounted per item, so the range reset to 30 days on every
 * item a trader opened — a pilot checking whether a run of prices is seasonal
 * re-picked "1y" once per lookup. The window a trader reads in is a habit,
 * not a property of the item.
 *
 * Free to remember: `loadPriceHistory` always fetches ESI's full daily series
 * for the region and the range only slices what is already in hand
 * (`engine/market/priceHistory.ts`), so no range costs more than any other.
 *
 * Silent, like the other page-state keys: the Select is its own display, and a
 * duplicate on the Settings page would be a second place to read the same fact
 * from.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';
import { PRICE_HISTORY_RANGES, type PriceHistoryRange } from '@/engine/market/priceHistory';

export const PRICE_HISTORY_RANGE_KEY = 'marketPriceHistoryRange';

export const DEFAULT_PRICE_HISTORY_RANGE: PriceHistoryRange = '30d';

function isPriceHistoryRange(raw: unknown): raw is PriceHistoryRange {
  return PRICE_HISTORY_RANGES.includes(raw as PriceHistoryRange);
}

export const usePriceHistoryRange = createLocalSetting<PriceHistoryRange>({
  key: PRICE_HISTORY_RANGE_KEY,
  defaultValue: DEFAULT_PRICE_HISTORY_RANGE,
  // A range dropped between releases is still a valid string, and one the
  // filter has no day count for would render an empty chart rather than fail.
  parse: (raw) => (isPriceHistoryRange(raw) ? raw : null),
});
