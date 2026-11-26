import { db } from '@/db';
import { getTradeHub, type TradeHub } from '@/market/hubs';
import { seedPageHubsOnce, useSeededOnce } from './pageHubSeed';

export const MARKET_BROWSER_HUB_SETTING_KEY = 'marketBrowserHub';
export const MARKET_BROWSER_HUB_MIGRATED_KEY = 'marketBrowserHubMigrated';

export function migrateDeviceMarketHub(): Promise<void> {
  return seedPageHubsOnce(MARKET_BROWSER_HUB_MIGRATED_KEY, ['market', 'appraisal'], async () => {
    const row = await db.settings.get(MARKET_BROWSER_HUB_SETTING_KEY);
    return typeof row?.value === 'string' && getTradeHub(row.value as TradeHub['id'])
      ? (row.value as TradeHub['id'])
      : null;
  });
}

export function useDeviceMarketHubMigrated(): boolean {
  return useSeededOnce(migrateDeviceMarketHub);
}
