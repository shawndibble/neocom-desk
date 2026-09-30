import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { db } from '@/db';
import { EDENCOM_SYSTEMS } from '@/engine/route/invasionSystems';
import { AVOIDED_SYSTEMS_KEY } from './avoidedSystems';
import {
  AVOID_EDENCOM_KEY,
  AVOID_POD_KILLS_KEY,
  AVOIDED_SYSTEMS_ENABLED_KEY,
  POD_KILL_THRESHOLD_KEY,
  ROUTE_PREFERENCE_KEY,
  clearPodKillsLoad,
  ROUTE_RULE_STORES,
  useRouteQuery,
} from './routeRules';

const loadPodKills = vi.fn<() => Promise<ReadonlyMap<number, number> | null>>();
vi.mock('@/features/travel/routeSafetyData', () => ({ loadPodKills: () => loadPodKills() }));

const UEDAMA = 30045328;
const PODDED = 30002813;

/** Every Travel store, reset to read its row afresh (and, with `initial`, to its default). */
function resetStores(initial: boolean) {
  for (const store of ROUTE_RULE_STORES) {
    const setState = store.setState as (partial: { hydrated: boolean; value?: unknown }) => void;
    setState(
      initial ? { hydrated: false, value: store.getInitialState().value } : { hydrated: false }
    );
  }
}

beforeEach(async () => {
  await db.settings.clear();
  // Module singletons: drop what a previous test hydrated, so each reads its own rows.
  resetStores(true);
  clearPodKillsLoad();
  loadPodKills.mockReset().mockResolvedValue(new Map([[PODDED, 4]]));
});

async function settle(preferenceOverride?: 'shortest') {
  const hook = renderHook(() => useRouteQuery(preferenceOverride));
  await waitFor(() => expect(hook.result.current.hydrated).toBe(true));
  return hook.result.current;
}

describe('useRouteQuery', () => {
  it('routes by the stored default, and by a page override over it', async () => {
    await db.settings.put({ key: ROUTE_PREFERENCE_KEY, value: 'avoid-highsec' });
    expect((await settle()).rules.preference).toBe('avoid-highsec');
    expect((await settle('shortest')).rules.preference).toBe('shortest');
  });

  it("adopts the Assets page's old Safest as Prefer safer", async () => {
    await db.settings.put({ key: 'assetsRoutePreference', value: 'safest' });
    expect((await settle()).rules.preference).toBe('prefer-highsec');
  });

  it('drops the Avoided Systems while their switch is off, keeping them stored', async () => {
    await db.settings.put({ key: AVOIDED_SYSTEMS_KEY, value: [UEDAMA] });
    expect((await settle()).rules.avoid).toEqual([UEDAMA]);

    resetStores(false);
    await db.settings.put({ key: AVOIDED_SYSTEMS_ENABLED_KEY, value: false });
    expect((await settle()).rules.avoid).toEqual([]);
  });

  it('adds the EDENCOM systems when asked', async () => {
    await db.settings.put({ key: AVOID_EDENCOM_KEY, value: true });
    expect((await settle()).rules.avoid).toHaveLength(EDENCOM_SYSTEMS.length);
  });

  it('holds routing until the kill feed is in, then avoids systems at the threshold', async () => {
    await db.settings.put({ key: AVOID_POD_KILLS_KEY, value: true });
    await db.settings.put({ key: POD_KILL_THRESHOLD_KEY, value: 4 });
    const query = await settle();
    expect(query.rules.avoid).toEqual([PODDED]);
    expect(query.podKillsUnavailable).toBe(false);
  });

  it('routes without pod kills, and says so, when the feed cannot be read', async () => {
    loadPodKills.mockResolvedValue(null);
    await db.settings.put({ key: AVOID_POD_KILLS_KEY, value: true });
    const query = await settle();
    expect(query.rules.avoid).toEqual([]);
    expect(query.podKillsUnavailable).toBe(true);
  });

  it('changes its key exactly when the rules change', async () => {
    const plain = await settle();
    expect((await settle()).key).toBe(plain.key);
    expect((await settle('shortest')).key).not.toBe(plain.key);
  });
});
