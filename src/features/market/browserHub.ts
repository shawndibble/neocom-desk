/**
 * The Market Browser's old device-local Trade Hub (`marketBrowserHub`, before
 * issue #6523), folded into the synced Market and Appraisal page hubs.
 *
 * It was device-local so that browsing Amarr on a phone never moved the hub
 * every other page priced at. A Market entry gives the same separation. So on
 * a device's first Market visit after this shipped, the device's hub becomes
 * the Market and Appraisal entries, only where that area has none yet
 * (another device may have set one). A device that never opened the Market
 * has no row, and its Market starts on Global, which it seeded from before.
 *
 * Mixed builds share this data (dev and prod share Firebase, and a stale tab
 * runs an older bundle), so the migration only adds:
 * - The device row is kept, and a separate local marker records the fold. An
 *   older build on this device still reads its row as before, and the marker
 *   keeps a later "back to Global" from being re-seeded.
 * - It waits for the first sync pull (bounded), so the map it writes back
 *   whole holds entries other devices set since this one last synced.
 *
 * Re-running is harmless: once the marker is set there is nothing to do, and a
 * concurrent first run writes the same entries.
 */
import { useEffect, useState } from 'react';
import { db } from '@/db';
import { isSyncConfigured } from '@/app/syncStatus';
import { FIRST_PULL_WAIT_MS } from '@/features/overview/widgets/firstRun';
import { getTradeHub, type TradeHub } from '@/market/hubs';
import { subscribeSyncStatus } from '@/sync/status';
import { ownHub, setPageHub, usePageHubs } from './pageHubs';

export const MARKET_BROWSER_HUB_SETTING_KEY = 'marketBrowserHub';
/** Local only: this device's Browser hub has been folded into the page hubs. */
export const MARKET_BROWSER_HUB_MIGRATED_KEY = 'marketBrowserHubMigrated';

/** Resolves once a sync pass has run (or failed), or after the first-pull wait, whichever is first. */
function afterFirstPull(): Promise<void> {
  if (!isSyncConfigured()) return Promise.resolve();
  return new Promise((resolve) => {
    let ready = false;
    let subscribed = false;
    // The listener runs once at once, inside `subscribeSyncStatus`: it only notes readiness then.
    const unsubscribe = subscribeSyncStatus((status) => {
      if (status.lastSyncedAt === null && status.state !== 'error') return;
      ready = true;
      if (subscribed) finish();
    });
    subscribed = true;
    const timer = setTimeout(finish, FIRST_PULL_WAIT_MS);
    if (ready) finish();
    function finish() {
      clearTimeout(timer);
      unsubscribe();
      resolve();
    }
  });
}

export async function migrateDeviceMarketHub(): Promise<void> {
  const [row, marker] = await Promise.all([
    db.settings.get(MARKET_BROWSER_HUB_SETTING_KEY),
    db.settings.get(MARKET_BROWSER_HUB_MIGRATED_KEY),
  ]);
  if (row === undefined || marker !== undefined) return;
  const hub =
    typeof row.value === 'string' && getTradeHub(row.value as TradeHub['id'])
      ? (row.value as TradeHub['id'])
      : null;
  if (hub !== null) {
    await Promise.all([afterFirstPull(), usePageHubs.getState().hydrate()]);
    const before = usePageHubs.getState().value;
    let next = before;
    if (!ownHub(next, 'market')) next = setPageHub(next, 'market', hub);
    if (!ownHub(next, 'appraisal')) next = setPageHub(next, 'appraisal', hub);
    if (next !== before) await usePageHubs.getState().setValue(next);
  }
  await db.settings.put({ key: MARKET_BROWSER_HUB_MIGRATED_KEY, value: true });
}

/** `true` once this device's old Market Browser hub has been folded in (at once when there was none). */
export function useDeviceMarketHubMigrated(): boolean {
  const [done, setDone] = useState(false);
  useEffect(() => {
    let live = true;
    // A failed read leaves the marker unset for next time; the page still opens.
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
