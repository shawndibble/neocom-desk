import { describe, expect, it, vi } from 'vitest';
import {
  ACTIVE_WARS_R2_KEY,
  ACTIVE_WARS_STATE_R2_KEY,
  publishActiveWars,
  r2ConfigFromEnv,
} from './publicDataActiveWars.js';

vi.mock('firebase-functions/logger', () => ({ info: vi.fn(), warn: vi.fn() }));

const NOW = Date.UTC(2026, 9, 21, 12);
const esiWar = (id: number) => ({
  id,
  declared: '2026-10-20T06:00:00Z',
  mutual: false,
  open_for_allies: false,
  aggressor: { corporation_id: 1, isk_destroyed: 0, ships_killed: 0 },
  defender: { corporation_id: 2, isk_destroyed: 0, ships_killed: 0 },
});

function esi(listed: number[]) {
  return (async (input: string | URL | Request) => {
    const detail = /\/wars\/(\d+)\/$/.exec(String(input));
    return detail ? Response.json(esiWar(Number(detail[1]))) : Response.json(listed);
  }) as typeof fetch;
}

describe('publishActiveWars', () => {
  it('publishes the list and the sweep state to R2', async () => {
    const puts = new Map<string, { body: string; headers: Record<string, string> }>();
    const wrote = await publishActiveWars({
      get: async () => null,
      put: async (key, body, headers) => {
        puts.set(key, { body: String(body), headers });
      },
      fetchImpl: esi([12, 11]),
      now: () => NOW,
    });
    expect(wrote).toBe(true);
    const list = JSON.parse(puts.get(ACTIVE_WARS_R2_KEY)?.body ?? 'null');
    expect(list.updatedAt).toBe(NOW);
    expect(list.wars.map((war: { id: number }) => war.id)).toEqual([12, 11]);
    expect(list.topId).toBeUndefined();
    expect(puts.get(ACTIVE_WARS_R2_KEY)?.headers['Cache-Control']).toContain('max-age=3600');
    expect(JSON.parse(puts.get(ACTIVE_WARS_STATE_R2_KEY)?.body ?? 'null')).toMatchObject({
      topId: 12,
    });
  });

  it('resumes from the stored state', async () => {
    const calls: string[] = [];
    const fetchImpl = esi([12, 11]);
    await publishActiveWars({
      get: async () => ({ updatedAt: NOW - 1, wars: [], topId: 12, floorId: 11 }),
      put: async () => {},
      fetchImpl: (async (input: string | URL | Request, init?: RequestInit) => {
        calls.push(String(input));
        return fetchImpl(input, init);
      }) as typeof fetch,
      now: () => NOW,
    });
    expect(calls.filter((url) => /\/wars\/\d+\/$/.test(url))).toEqual([]);
  });

  it('publishes nothing when ESI will not list wars', async () => {
    const put = vi.fn();
    const wrote = await publishActiveWars({
      get: async () => null,
      put,
      fetchImpl: (async () => new Response('', { status: 503 })) as typeof fetch,
    });
    expect(wrote).toBe(false);
    expect(put).not.toHaveBeenCalled();
  });
});

describe('publishActiveWars while seeding', () => {
  it('keeps the state but not the list until the sweep reaches the horizon', async () => {
    const stored = new Map<string, unknown>();
    const run = () =>
      publishActiveWars({
        get: async (key) => stored.get(key) ?? null,
        put: async (key, body) => {
          stored.set(key, JSON.parse(String(body)));
        },
        // Ended wars are not held open, so they do not eat the next run's budget.
        fetchImpl: (async (input: string | URL | Request) => {
          const detail = /\/wars\/(\d+)\/$/.exec(String(input));
          return detail
            ? Response.json({ ...esiWar(Number(detail[1])), finished: '2026-10-21T00:00:00Z' })
            : Response.json([12, 11, 10]);
        }) as typeof fetch,
        now: () => NOW,
        budget: 1,
      });
    await run();
    expect(stored.has(ACTIVE_WARS_R2_KEY)).toBe(false);
    expect(stored.has(ACTIVE_WARS_STATE_R2_KEY)).toBe(true);
    await run();
    await run();
    expect(stored.has(ACTIVE_WARS_R2_KEY)).toBe(true);
  });
});

describe('r2ConfigFromEnv', () => {
  it('names every missing setting', () => {
    expect(() => r2ConfigFromEnv({ R2_BUCKET: 'b' })).toThrow(
      'R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY'
    );
  });
});
