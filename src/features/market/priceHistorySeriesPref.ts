/**
 * Device-local: which open-price lines the Price History chart draws (Buy /
 * Sell, Buy, Sell, Average). Remembered like the range (`priceHistoryRangePref.ts`) for
 * the same reason: the panel remounts per item, and which side a trader reads
 * is a habit, not a property of the item.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';
import { PRICE_SERIES_CHOICES, type PriceSeriesChoice } from '@/engine/market/priceHistoryOpen';

export const PRICE_HISTORY_SERIES_KEY = 'marketPriceHistorySeries';

export const DEFAULT_PRICE_HISTORY_SERIES: PriceSeriesChoice = 'both';

export const usePriceHistorySeries = createLocalSetting<PriceSeriesChoice>({
  key: PRICE_HISTORY_SERIES_KEY,
  defaultValue: DEFAULT_PRICE_HISTORY_SERIES,
  parse: (raw) =>
    PRICE_SERIES_CHOICES.includes(raw as PriceSeriesChoice) ? (raw as PriceSeriesChoice) : null,
});
