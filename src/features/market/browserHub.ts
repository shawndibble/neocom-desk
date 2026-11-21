/**
 * The Market Browser's old device-local Trade Hub (`marketBrowserHub`, before
 * issue #6523), folded into the synced Market and Appraisal page hubs.
 *
 * It was device-local so that browsing Amarr on a phone never moved the hub
 * every other page priced at. A Market entry gives the same separation. So on
 * a device's first Market visit after this shipped, the device's hub becomes
 * the Market and Appraisal entries (`pageHubSeed.ts`). A device that never
 * opened the Market has no row, and its Market starts on Global, which it
 * seeded from before.
 */
import { db } from '@/db';
import { getTradeHub, type TradeHub } from '@/market/hubs';
import { seedPageHubsOnce, useSeededOnce } from './pageHubSeed';

export const MARKET_BROWSER_HUB_SETTING_KEY = 'marketBrowserHub';
/** Local only: this device's Browser hub has been folded into the page hubs. */
export const MARKET_BROWSER_HUB_MIGRATED_KEY = 'marketBrowserHubMigrated';

export function migrateDeviceMarketHub(): Promise<void> {
  return seedPageHubsOnce(MARKET_BROWSER_HUB_MIGRATED_KEY, ['market', 'appraisal'], async () => {
    const row = await db.settings.get(MARKET_BROWSER_HUB_SETTING_KEY);
    return typeof row?.value === 'string' && getTradeHub(row.value as TradeHub['id'])
      ? (row.value as TradeHub['id'])
      : null;
  });
}

/** `true` once this device's old Market Browser hub has been folded in (at once when there was none). */
export function useDeviceMarketHubMigrated(): boolean {
  return useSeededOnce(migrateDeviceMarketHub);
}
