/**
 * The Market Browser's old device-local Trade Hub (`marketBrowserHub`, before
 * issue #6523), folded into the synced Market and Appraisal page hubs.
 *
 * It was device-local so that browsing Amarr on a phone never moved the hub
 * every other page priced at. Page hubs give the same separation on purpose:
 * Market has an entry of its own. So on a device's first Market visit after
 * this shipped, the device's hub becomes the Market and Appraisal entries —
 * only where that area has none yet (another device may have set one) — and
 * the device copy is deleted. A device that never opened the Market has no
 * row, and its Market starts on Global, which is what it seeded from before.
 *
 * Idempotent: once the row is gone there is nothing to do, and a second run
 * racing the first only re-checks entries that already exist.
 */
import { useEffect, useState } from 'react';
import { db } from '@/db';
import { getTradeHub, type TradeHub } from '@/market/hubs';
import { setPageHub, usePageHubs } from './pageHubs';

export const MARKET_BROWSER_HUB_SETTING_KEY = 'marketBrowserHub';

export async function migrateDeviceMarketHub(): Promise<void> {
  const row = await db.settings.get(MARKET_BROWSER_HUB_SETTING_KEY);
  if (row === undefined) return;
  const hub =
    typeof row.value === 'string' && getTradeHub(row.value as TradeHub['id'])
      ? (row.value as TradeHub['id'])
      : null;
  if (hub !== null) {
    await usePageHubs.getState().hydrate();
    const before = usePageHubs.getState().value;
    let next = before;
    if (!next.market) next = setPageHub(next, 'market', hub);
    if (!next.appraisal) next = setPageHub(next, 'appraisal', hub);
    if (next !== before) await usePageHubs.getState().setValue(next);
  }
  await db.settings.delete(MARKET_BROWSER_HUB_SETTING_KEY);
}

/** `true` once this device's old Market Browser hub has been folded in (at once when there was none). */
export function useDeviceMarketHubMigrated(): boolean {
  const [done, setDone] = useState(false);
  useEffect(() => {
    let live = true;
    // A failed read leaves the row for next time; the page still opens.
    void migrateDeviceMarketHub()
      .catch(() => undefined)
      .then(() => {
        if (live) setDone(true);
      });
    return () => {
      live = false;
    };
  }, []);
  return done;
}
