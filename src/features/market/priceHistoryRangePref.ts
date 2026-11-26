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
  parse: (raw) => (isPriceHistoryRange(raw) ? raw : null),
});
