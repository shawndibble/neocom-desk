import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import { clearNpcStationIndex } from '@/sde/npcStations';
import type { NpcStationEntry } from '@/sde/marketTypes';
import { loadStationName, loadStationSummary, loadStationSystemId } from './stations';

const JITA_ID = 60003760;
const JITA_NAME = 'Jita IV - Moon 4 - Caldari Navy Assembly Plant';
/** Stands in for a snapshot built before #655 added `typeId`: the field is absent. */
const AMARR_ID = 60008494;
const AMARR_NAME = 'Amarr VIII (Oris) - Emperor Family Academy';

const SNAPSHOT: NpcStationEntry[] = [
  { id: JITA_ID, name: JITA_NAME, systemId: 30000142, typeId: 52678 },
  { id: AMARR_ID, name: AMARR_NAME, systemId: 30002187 },
];

const loadNpcStations = vi.fn(async (): Promise<NpcStationEntry[]> => SNAPSHOT);
vi.mock('@/sde/loadMarketSde', () => ({
  loadNpcStations: () => loadNpcStations(),
}));

// `onUnhandledRequest: 'error'` is the real assertion in this file: a test
// that resolves a name with no handler registered proves no ESI request was
// made at all, which is stronger than counting calls on a spy.
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(async () => {
  await db.esiCache.clear();
  clearNpcStationIndex();
  loadNpcStations.mockReset();
  loadNpcStations.mockResolvedValue(SNAPSHOT);
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('loadStationName', () => {
  it('resolves from the SDE snapshot without any ESI request', async () => {
    expect(await loadStationName(JITA_ID)).toBe(JITA_NAME);
  });

  it('resolves a whole page of station ids off one snapshot read', async () => {
    // The point of item E: `Promise.all(stationIds.map(loadStationName))` at
    // Assets/Clones/owned-stock detection stops being a network fan-out, so
    // there is nothing left there to cap.
    const ids = Array.from({ length: 12 }, () => [JITA_ID, AMARR_ID]).flat();

    const names = await Promise.all(ids.map((id) => loadStationName(id)));

    expect(new Set(names)).toEqual(new Set([JITA_NAME, AMARR_NAME]));
    expect(loadNpcStations).toHaveBeenCalledTimes(1);
  });

  it('falls back to ESI for a station the snapshot predates', async () => {
    // A station CCP added since the last `npm run sde:build`. Rare, but the
    // fallback is what stops a stale snapshot from losing a name outright.
    server.use(
      http.get(`${ESI_BASE_URL}/universe/stations/60099999`, () =>
        HttpResponse.json({
          station_id: 60099999,
          name: 'Somewhere New',
          type_id: 1531,
          system_id: 30000001,
        })
      )
    );

    expect(await loadStationName(60099999)).toBe('Somewhere New');
  });

  it('falls back to ESI, and caches under the global sentinel, when the snapshot cannot be read', async () => {
    loadNpcStations.mockRejectedValue(new Error('offline'));
    server.use(
      http.get(`${ESI_BASE_URL}/universe/stations/${JITA_ID}`, () =>
        HttpResponse.json({
          station_id: JITA_ID,
          name: JITA_NAME,
          type_id: 52678,
          system_id: 30000142,
        })
      )
    );

    const name = await loadStationName(JITA_ID);

    expect(name).toBe(JITA_NAME);
    expect((await db.esiCache.get([0, `station:${JITA_ID}`]))?.value).toMatchObject({
      name: JITA_NAME,
    });
  });

  it('returns null when unresolvable (structure, or offline + uncached)', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/universe/stations/1000000000001`, () => HttpResponse.error())
    );

    const name = await loadStationName(1000000000001);

    expect(name).toBeNull();
  });
});

describe('loadStationSystemId', () => {
  it('reads the system straight off the snapshot', async () => {
    expect(await loadStationSystemId(JITA_ID)).toBe(30000142);
  });
});

describe('loadStationSummary', () => {
  it('serves all three fields from the snapshot, with no ESI request', async () => {
    expect(await loadStationSummary(JITA_ID)).toEqual({
      name: JITA_NAME,
      systemId: 30000142,
      typeId: 52678,
    });
  });

  it('falls back to ESI when the snapshot predates the typeId field', async () => {
    // A deployed snapshot built before #655 carries `{ id, name, systemId }`
    // only, and a summary missing its typeId is not a summary.
    server.use(
      http.get(`${ESI_BASE_URL}/universe/stations/${AMARR_ID}`, () =>
        HttpResponse.json({
          station_id: AMARR_ID,
          name: AMARR_NAME,
          type_id: 1932,
          system_id: 30002187,
        })
      )
    );

    expect(await loadStationSummary(AMARR_ID)).toEqual({
      name: AMARR_NAME,
      systemId: 30002187,
      typeId: 1932,
    });
  });
});
