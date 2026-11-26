import { createSyncedSetting } from '@/lib/useSyncedSetting';

export const MARKET_PRICE_PERCENT_SETTING_KEY = 'sync.marketPricePercent';

export const DEFAULT_PRICE_PERCENT = 100;

export const MIN_PRICE_PERCENT = 0;
export const MAX_PRICE_PERCENT = 1000;

export function isValidPricePercent(value: number): boolean {
  return Number.isFinite(value) && value >= MIN_PRICE_PERCENT && value <= MAX_PRICE_PERCENT;
}

export const useMarketPricePercent = createSyncedSetting<number>({
  key: MARKET_PRICE_PERCENT_SETTING_KEY,
  defaultValue: DEFAULT_PRICE_PERCENT,
  parse: (raw) => (typeof raw === 'number' && isValidPricePercent(raw) ? raw : null),
});

export const PRICE_PERCENT_PARAM = 'percent';

export function parsePricePercentParam(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') return null;
  const value = Number(raw);
  return isValidPricePercent(value) ? value : null;
}
