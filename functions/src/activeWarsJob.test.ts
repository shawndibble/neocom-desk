import { describe, expect, it, vi } from 'vitest';
import { runActiveWarsSweep, type ActiveWarsDeps, type ActiveWarsDoc } from './activeWarsJob.js';

vi.mock('firebase-functions/logger', () => ({ info: vi.fn(), warn: vi.fn() }));

const NOW = Date.UTC(2026, 9, 21, 12);
const HOUR = 3_600_000;

const esiWar = (id: number, over: Record<string, unknown> = {}) => ({
  id,
  declared: '2026-10-20T06:00:00Z',
  started: '2026-10-21T06:00:00Z',
  mutual: false,
  open_for_allies: false,
  aggressor: { corporation_id: 1, isk_destroyed: 0, ships_killed: 0 },
  defender: { corporation_id: 2, isk_destroyed: 0, ships_killed: 0 },
  ...over,
});

interface Route {
  status?: number;
  body?: unknown;
  remaining?: string;
}

/** A fake ESI: `/wars/` lists ids, `/wars/{id}/` answers from `wars`. */
function fakeEsi(listed: number[], wars: Record<number, Route>, calls: string[] = []) {
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const detail = /\/wars\/(\d+)\/$/.exec(url);
    if (!detail) return Response.json(listed);
    const route = wars[Number(detail[1])] ?? { status: 404 };
    return new Response(JSON.stringify(route.body ?? null), {
      status: route.status ?? 200,
      headers: route.remaining === undefined ? {} : { 'x-ratelimit-remaining': route.remaining },
    });
  }) as typeof fetch;
  return fetchImpl;
}

function run(fetchImpl: typeof fetch, stored: ActiveWarsDoc | undefined, budget = 100) {
  const write = vi.fn(async () => {});
  const deps: ActiveWarsDeps = {
    fetchImpl,
    read: async () => stored,
    write,
    now: () => NOW,
    budget,
  };
  return { write, result: runActiveWarsSweep(deps) };
}

describe('runActiveWarsSweep', () => {
  it('on a first run seeds from the newest id and keeps the open wars', async () => {
    const esi = fakeEsi([12, 11, 10], {
      12: { body: esiWar(12) },
      11: { body: esiWar(11, { finished: '2026-10-01T00:00:00Z' }) },
      10: { body: esiWar(10) },
    });
    const { write, result } = run(esi, undefined);
    expect(await result).toMatchObject({ open: 2, written: true });
    const doc = (write.mock.calls[0] as unknown[])[0] as {
      wars: { id: number }[];
      topId: number;
      floorId: number;
      updatedAt: number;
    };
    expect(doc.wars.map((war) => war.id)).toEqual([12, 10]);
    expect(doc.topId).toBe(12);
    expect(doc.floorId).toBe(10);
    expect(doc.updatedAt).toBe(NOW);
  });

  it('reads new ids above the top and re-reads held wars, dropping one that finished', async () => {
    const held = {
      ...esiWar(9),
      declared: Date.parse('2026-10-18T00:00:00Z'),
      started: 1,
      mutual: false,
      openForAllies: false,
      aggressor: { corporationId: 1, iskDestroyed: 0, shipsKilled: 0 },
      defender: { corporationId: 2, iskDestroyed: 0, shipsKilled: 0 },
      allies: [],
    };
    const esi = fakeEsi([13, 12, 9], {
      13: { body: esiWar(13) },
      12: { body: esiWar(12) },
      9: { body: esiWar(9, { finished: new Date(NOW - HOUR).toISOString() }) },
    });
    const { write, result } = run(
      esi,
      { updatedAt: NOW - 12 * HOUR, topId: 11, floorId: 9, wars: [held] },
      3
    );
    await result;
    const doc = (write.mock.calls[0] as unknown[])[0] as { wars: { id: number }[]; topId: number };
    expect(doc.wars.map((war) => war.id)).toEqual([13, 12]);
    expect(doc.topId).toBe(13);
  });

  it('writes nothing when ESI will not list wars', async () => {
    const esi = (async () => new Response('', { status: 503 })) as typeof fetch;
    const { write, result } = run(esi, undefined);
    expect(await result).toBeNull();
    expect(write).not.toHaveBeenCalled();
  });

  it('does not claim a fresh list when a held war could not be read again', async () => {
    const held = {
      id: 5,
      declared: 1,
      started: 1,
      mutual: false,
      openForAllies: false,
      aggressor: { corporationId: 1, iskDestroyed: 0, shipsKilled: 0 },
      defender: { corporationId: 2, iskDestroyed: 0, shipsKilled: 0 },
      allies: [],
    };
    const esi = fakeEsi([20, 5], { 20: { body: esiWar(20) }, 5: { status: 429 } });
    const { write, result } = run(esi, { updatedAt: 777, topId: 5, floorId: 5, wars: [held] }, 50);
    await result;
    const doc = (write.mock.calls[0] as unknown[])[0] as {
      updatedAt: number;
      wars: { id: number }[];
    };
    // The held war stays listed, but the list is not confirmed as of now.
    expect(doc.updatedAt).toBe(777);
    expect(doc.wars.map((war) => war.id)).toEqual([20, 5]);
  });

  it('counts a seed war whose body is not a war as done, so the floor can pass it', async () => {
    const esi = fakeEsi([12, 11, 10], {
      12: { body: esiWar(12) },
      11: { body: { id: 11 } },
      10: { body: esiWar(10) },
    });
    const { write, result } = run(esi, undefined);
    await result;
    const doc = (write.mock.calls[0] as unknown[])[0] as {
      floorId: number;
      wars: { id: number }[];
    };
    expect(doc.floorId).toBe(10);
    expect(doc.wars.map((war) => war.id)).toEqual([12, 10]);
  });

  it('keeps the list fresh when one held war of many will not read', async () => {
    const held = (id: number) => ({
      id,
      declared: NOW - 10 * HOUR,
      started: NOW - HOUR,
      mutual: false,
      openForAllies: false,
      aggressor: { corporationId: 1, iskDestroyed: 0, shipsKilled: 0 },
      defender: { corporationId: 2, iskDestroyed: 0, shipsKilled: 0 },
      allies: [],
    });
    const ids = Array.from({ length: 40 }, (_, i) => 100 + i);
    const routes: Record<number, Route> = {};
    for (const id of ids) routes[id] = id === 100 ? { status: 500 } : { body: esiWar(id) };
    const esi = fakeEsi([...ids].reverse(), routes);
    const { write, result } = run(
      esi,
      { updatedAt: 777, topId: 139, floorId: 100, wars: ids.map(held) },
      100
    );
    await result;
    const doc = (write.mock.calls[0] as unknown[])[0] as { updatedAt: number };
    expect(doc.updatedAt).toBe(NOW);
  });
});
