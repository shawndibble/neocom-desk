import { useEffect, useState } from 'react';
import { db } from '@/db';
import { isSyncConfigured } from '@/app/syncStatus';
import { FIRST_PULL_WAIT_MS, syncSettled } from '@/features/overview/widgets/firstRun';
import type { TradeHub } from '@/market/hubs';
import { registerTestReset } from '@/lib/testResets';
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

function afterFirstPull(): Promise<void> {
  if (!isSyncConfigured()) return Promise.resolve();
  return new Promise((resolve) => {
    let ready = false;
    let subscribed = false;
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

const running = new Map<string, Promise<void>>();
registerTestReset(() => running.clear());

export function seedPageHubsOnce(
  markerKey: string,
  areas: readonly PageHubArea[],
  readOldHub: () => Promise<TradeHub['id'] | null>
): Promise<void> {
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
    const [row, parkedRow] = await Promise.all([
      db.settings.get(PAGE_HUBS_SETTING_KEY),
      db.settings.get(PARKED_PAGE_HUBS_SETTING_KEY),
    ]);
    const before = (row && parsePageHubs(row.value)) ?? usePageHubs.getState().value;
    const parked =
      (parkedRow && parsePageHubs(parkedRow.value)) ?? useParkedPageHubs.getState().value;
    let next = before;
    for (const area of areas)
      if (!ownChoice(next, area) && !ownChoice(parked, area)) next = setPageHub(next, area, hub);
    if (next !== before) await usePageHubs.getState().setValue(next);
  }
  await db.settings.put({ key: markerKey, value: true });
}

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
