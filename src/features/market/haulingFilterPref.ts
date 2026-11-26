import { createLocalSetting } from '@/lib/useLocalSetting';

export const HAULING_FILTER_SETTING_KEY = 'haulingFilter';

export type HaulingDemandFilter = 'steady' | 'any';

export interface StoredHaulingFilter {
  days: number;
  margin: number;
  demand: HaulingDemandFilter;
  maxprice: number | null;
}

export const DEFAULT_HAULING_FILTER: StoredHaulingFilter = {
  days: 14,
  margin: 3,
  demand: 'steady',
  maxprice: null,
};

export function parseStoredHaulingFilter(raw: unknown): StoredHaulingFilter | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Record<string, unknown>;
  const days = record.days;
  const margin = record.margin;
  const demand = record.demand;
  if (typeof days !== 'number' || typeof margin !== 'number') return null;
  if (demand !== 'steady' && demand !== 'any') return null;
  const maxprice =
    Number.isSafeInteger(record.maxprice) && (record.maxprice as number) > 0
      ? (record.maxprice as number)
      : null;
  return { days, margin, demand, maxprice };
}

export const useHaulingFilterPref = createLocalSetting<StoredHaulingFilter>({
  key: HAULING_FILTER_SETTING_KEY,
  defaultValue: DEFAULT_HAULING_FILTER,
  parse: parseStoredHaulingFilter,
});
