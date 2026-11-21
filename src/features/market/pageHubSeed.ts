/**
 * Seeding page hubs once from a device-local hub a page kept before issue
 * #6523 (the Market Browser's, PI's). The old hub becomes the page's entry,
 * only where the page has none yet (another device may have set one).
 *
 * Mixed builds share this data (dev and prod share Firebase, and a stale tab
 * runs an older bundle), so a seed only adds:
 * - The old row is kept, and a separate local marker records the seed. An
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
import type { TradeHub } from '@/market/hubs';
import { subscribeSyncStatus } from '@/sync/status';
import { ownHub, setPageHub, usePageHubs, type PageHubArea } from './pageHubs';

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

/**
 * Seeds `areas` at the hub `readOldHub` finds, once per device (`markerKey`, a
 * local `db.settings` key). `readOldHub` resolves `null` when this device has
 * nothing to fold in; the marker is set either way.
 */
export async function seedPageHubsOnce(
  markerKey: string,
  areas: readonly PageHubArea[],
  readOldHub: () => Promise<TradeHub['id'] | null>
): Promise<void> {
  if ((await db.settings.get(markerKey)) !== undefined) return;
  const hub = await readOldHub();
  if (hub !== null) {
    await Promise.all([afterFirstPull(), usePageHubs.getState().hydrate()]);
    const before = usePageHubs.getState().value;
    let next = before;
    for (const area of areas) if (!ownHub(next, area)) next = setPageHub(next, area, hub);
    if (next !== before) await usePageHubs.getState().setValue(next);
  }
  await db.settings.put({ key: markerKey, value: true });
}

/** `true` once `seed` has run on this mount (a failed read leaves its marker unset for next time). */
export function useSeededOnce(seed: () => Promise<void>): boolean {
  const [done, setDone] = useState(false);
  useEffect(() => {
    let live = true;
    void seed()
      .catch(() => undefined)
      .then(() => {
        if (live) setDone(true);
      });
    return () => {
      live = false;
    };
  }, [seed]);
  return done;
}
