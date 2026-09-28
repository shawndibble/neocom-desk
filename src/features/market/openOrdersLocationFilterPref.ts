/**
 * Open Orders' location filter, remembered across visits and app restarts.
 *
 * The rest of this page's filter lives entirely in the URL (ADR 0015,
 * `openOrdersFilter.ts`), which is enough for "reopen the same link" but not
 * for "reopen the app": a fresh `/market/orders` visit carries no query
 * string, so nothing URL-only survives a closed tab or a relaunched PWA. The
 * location filter is the one field a hauler with orders parked in the same
 * few stations wants to persist by itself, hence this device-local mirror.
 *
 * URL wins whenever present (decision `20260922-221531` / ADR 0015): this
 * setting is consulted only for the `orders.locations` field, and only when
 * the URL leaves it unset. `OpenOrdersPanel.tsx` hands it to
 * `useRememberedUrlParams` (`lib/useUrlState.ts`), which owns that per-field
 * presence check — nothing here ever mirrors a stored value back into the
 * URL, and this is written to only from an actual filter change.
 */
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
