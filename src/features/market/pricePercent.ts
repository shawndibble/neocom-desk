/**
 * The Appraisal tab's percentage of market — what a pasted list is priced at
 * relative to the hub's own best buy and sell orders. 100 is the order book
 * as it stands; a buyer quoting loot pays some fraction of it.
 *
 * Synced across devices for the same reason `hub.ts` is, and it is the other
 * half of that same control cluster: which hub you price at and what fraction
 * of it you pay are both facts about how the pilot trades, not about the
 * machine they happened to open. See `sync/syncedSettings.ts` for why adding
 * the key there is a deliberate two-file edit.
 *
 * Local to this feature — no other view reads it — so it lives here rather
 * than in `src/stores/`.
 */
import { createSyncedSetting } from '@/lib/useSyncedSetting';

export const MARKET_PRICE_PERCENT_SETTING_KEY = 'sync.marketPricePercent';

export const DEFAULT_PRICE_PERCENT = 100;

/**
 * The field's bounds. Zero is allowed (it is a legitimate, if odd, "value
 * this at nothing"); the ceiling is well past any real quote and exists only
 * so a mistyped value cannot render a total in scientific notation.
 */
export const MIN_PRICE_PERCENT = 0;
export const MAX_PRICE_PERCENT = 1000;

export function isValidPricePercent(value: number): boolean {
  return Number.isFinite(value) && value >= MIN_PRICE_PERCENT && value <= MAX_PRICE_PERCENT;
}

export const useMarketPricePercent = createSyncedSetting<number>({
  key: MARKET_PRICE_PERCENT_SETTING_KEY,
  defaultValue: DEFAULT_PRICE_PERCENT,
  // A value pulled from another device may have been written by an older
  // build, so the range is re-checked here and not only at the input —
  // `lib/useSyncedSetting.ts` runs `parse` over pulled values for exactly
  // this reason.
  parse: (raw) => (typeof raw === 'number' && isValidPricePercent(raw) ? raw : null),
});
