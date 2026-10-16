/**
 * The Hauling tab's "Sells within" / "Margin over" / "Demand" / "Max price
 * per item" filter, remembered across sessions. Max spend lives in the
 * `haulingBudget` store (`haulingCargo.ts`).
 *
 * URL wins whenever present (scope decision `20260922-221531` / ADR 0015):
 * this setting is consulted only for the fields a link leaves unset.
 * `HaulingPanel.tsx` hands it to `useRememberedUrlParams`
 * (`lib/useUrlState.ts`), which owns that per-field presence check — nothing
 * ever mirrors a stored value back into the URL, and this is written to only
 * when a covered field actually changes: a `FilterBar` edit, or the
 * empty-state Reset action (both flow through the same `setParams`).
 */
import { createLocalSetting } from '@/lib/useLocalSetting';

export const HAULING_FILTER_SETTING_KEY = 'haulingFilter';

/** How rarely-selling items are treated — its own alias so the four places this travels (the URL codec, the stored shape, the `<Select>` cast, the parser) can't drift apart. */
export type HaulingDemandFilter = 'steady' | 'any';

export interface StoredHaulingFilter {
  days: number;
  margin: number;
  demand: HaulingDemandFilter;
  /** Max price per item, whole ISK; null is no limit. Named as its URL param, which `useRememberedUrlParams` keys on. */
  maxprice: number | null;
}

/** The filter a hauler who has never touched it sees — matches the URL codecs' own defaults. */
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
  // Absent in a filter stored before Max price existed: that reads as no limit.
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
