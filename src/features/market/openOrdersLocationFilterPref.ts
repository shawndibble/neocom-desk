import { createLocalSetting } from '@/lib/useLocalSetting';

export const OPEN_ORDERS_LOCATION_FILTER_SETTING_KEY = 'market.openOrdersLocationFilter';

function parseLocationIds(raw: unknown): readonly number[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.every((id) => typeof id === 'number') ? (raw as number[]) : null;
}

export const useOpenOrdersLocationFilterPref = createLocalSetting<readonly number[]>({
  key: OPEN_ORDERS_LOCATION_FILTER_SETTING_KEY,
  defaultValue: [],
  parse: parseLocationIds,
});
