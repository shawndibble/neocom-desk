import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse, type JsonBodyType } from 'msw';
import { setupServer } from 'msw/node';
import { db } from '@/db';
import { ESI_BASE_URL } from '@/esi/client';
import { resetEsiBudget } from '@/esi/budget';
import { rejectBadEsiHeaders } from '@/esi/test-helpers';

const loadMarketRegions = vi.fn();
vi.mock('@/sde/loadMarketSde', () => ({ loadMarketRegions: () => loadMarketRegions() }));

import { loadRouteRegionNames, loadSystemActivity } from './routeSafetyData';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(async () => {
  await db.esiCache.clear();
  loadMarketRegions.mockReset();
  loadMarketRegions.mockResolvedValue([{ id: 10000002, name: 'The Forge' }]);
});
afterEach(() => {
  server.resetHandlers();
  resetEsiBudget();
});
afterAll(() => server.close());

function publicJson(path: string, body: JsonBodyType) {
  return http.get(`${ESI_BASE_URL}${path}`, ({ request }) => {
    const bad = rejectBadEsiHeaders(request);
    if (bad) return bad;
    // Public: nothing here may carry a Character's token.
    if (request.headers.get('authorization') !== null) {
      return HttpResponse.json({ error: 'unexpected auth' }, { status: 400 });
    }
    return HttpResponse.json(body);
  });
}

describe('loadSystemActivity', () => {
  it('reads both universe-wide feeds, one request each', async () => {
    let calls = 0;
    let jumpCalls = 0;
    server.use(
      http.get(`${ESI_BASE_URL}/universe/system_kills`, ({ request }) => {
        calls += 1;
        return (
          rejectBadEsiHeaders(request) ??
          HttpResponse.json([{ system_id: 30000142, ship_kills: 3, pod_kills: 1, npc_kills: 5 }])
        );
      }),
      http.get(`${ESI_BASE_URL}/universe/system_jumps`, ({ request }) => {
        jumpCalls += 1;
        return (
          rejectBadEsiHeaders(request) ??
          HttpResponse.json([{ system_id: 30000142, ship_jumps: 4200 }])
        );
      })
    );

    const activity = await loadSystemActivity();

    expect(calls).toBe(1);
    expect(jumpCalls).toBe(1);
    expect(activity.kills?.get(30000142)).toEqual({ shipKills: 3, podKills: 1, npcKills: 5 });
    expect(activity.jumps?.get(30000142)).toBe(4200);
    expect(activity.fetchedAt).toBeInstanceOf(Date);
  });

  it('serves the second read from cache rather than asking ESI again', async () => {
    let calls = 0;
    server.use(
      http.get(`${ESI_BASE_URL}/universe/system_kills`, () => {
        calls += 1;
        return HttpResponse.json([]);
      }),
      publicJson('/universe/system_jumps', [])
    );

    await loadSystemActivity();
    await loadSystemActivity();

    expect(calls).toBe(1);
  });

  it('reports a feed that failed with nothing cached as unknown, keeping the other', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/universe/system_kills`, () =>
        HttpResponse.json({ error: 'down' }, { status: 503 })
      ),
      publicJson('/universe/system_jumps', [{ system_id: 30000142, ship_jumps: 10 }])
    );

    const activity = await loadSystemActivity();

    expect(activity.kills).toBeNull();
    expect(activity.jumps?.get(30000142)).toBe(10);
  });
});

describe('loadRouteRegionNames', () => {
  it('names regions from the local table and asks ESI only for the rest', async () => {
    let asked: unknown = null;
    server.use(
      http.post(`${ESI_BASE_URL}/universe/names`, async ({ request }) => {
        asked = await request.json();
        return HttpResponse.json([{ id: 10000042, name: 'Metropolis', category: 'region' }]);
      })
    );

    const names = await loadRouteRegionNames([10000002, 10000042]);

    expect(asked).toEqual([10000042]);
    expect(names.get(10000002)).toBe('The Forge');
    expect(names.get(10000042)).toBe('Metropolis');
  });

  it('leaves a region unnamed when ESI cannot be reached', async () => {
    server.use(
      http.post(`${ESI_BASE_URL}/universe/names`, () =>
        HttpResponse.json({ error: 'down' }, { status: 503 })
      )
    );

    const names = await loadRouteRegionNames([10000042]);

    expect(names.has(10000042)).toBe(false);
  });
});
