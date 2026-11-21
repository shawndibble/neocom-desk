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
import { FIRST_PULL_WAIT_MS, syncSettled } from '@/features/overview/widgets/firstRun';
import type { TradeHub } from '@/market/hubs';
import { subscribeSyncStatus } from '@/sync/status';
import {
  ownChoice,
  PAGE_HUBS_SETTING_KEY,
  PARKED_PAGE_HUBS_SETTING_KEY,
  parsePageHubs,
  setPageHub,
  usePageHubs,
  useParkedPageHubs,
  type PageHubArea,
} from './pageHubs';

/** Resolves once the first pull has settled (`syncSettled`: landed, failed or offline), or after the first-pull wait. */
function afterFirstPull(): Promise<void> {
  if (!isSyncConfigured()) return Promise.resolve();
  return new Promise((resolve) => {
    let ready = false;
    let subscribed = false;
    // The listener runs once at once, inside `subscribeSyncStatus`: it only notes readiness then.
    const unsubscribe = subscribeSyncStatus((status) => {
      const settled = syncSettled({
        syncConfigured: true,
        state: status.state,
        lastSyncedAt: status.lastSyncedAt,
        online: navigator.onLine,
        waitedOut: false,
      });
      if (!settled) return;
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
const running = new Map<string, Promise<void>>();

export function seedPageHubsOnce(
  markerKey: string,
  areas: readonly PageHubArea[],
  readOldHub: () => Promise<TradeHub['id'] | null>
): Promise<void> {
  // Every reader on a page mounts the seed: one run per marker at a time.
  const pending = running.get(markerKey);
  if (pending) return pending;
  const run = seed(markerKey, areas, readOldHub).finally(() => running.delete(markerKey));
  running.set(markerKey, run);
  return run;
}

async function seed(
  markerKey: string,
  areas: readonly PageHubArea[],
  readOldHub: () => Promise<TradeHub['id'] | null>
): Promise<void> {
  if ((await db.settings.get(markerKey)) !== undefined) return;
  const hub = await readOldHub();
  if (hub !== null) {
    await Promise.all([
      afterFirstPull(),
      usePageHubs.getState().hydrate(),
      useParkedPageHubs.getState().hydrate(),
    ]);
    // The rows, not the stores: just after a pull a store can still hold the
    // map from before it, and writing that back whole would drop what arrived.
    const [row, parkedRow] = await Promise.all([
      db.settings.get(PAGE_HUBS_SETTING_KEY),
      db.settings.get(PARKED_PAGE_HUBS_SETTING_KEY),
    ]);
    const before = (row && parsePageHubs(row.value)) ?? usePageHubs.getState().value;
    const parked =
      (parkedRow && parsePageHubs(parkedRow.value)) ?? useParkedPageHubs.getState().value;
    let next = before;
    // A page with a hub set aside chose App setting: never turn it back on.
    for (const area of areas)
      if (!ownChoice(next, area) && !ownChoice(parked, area)) next = setPageHub(next, area, hub);
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
