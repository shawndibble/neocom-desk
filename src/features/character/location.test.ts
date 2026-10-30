import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { mswServer } from '@/test/msw';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { onEsiAuthFailure } from '@/esi/authFailureSignal';
import { db } from '@/db';
import { loadCharacterSolarSystemId } from './location';

const CHARACTER_ID = 42;

const server = mswServer();

beforeEach(async () => {
  configureEsi({ getToken: vi.fn(async () => 'tok') });
  await db.esiCache.clear();
});
afterEach(() => {
  configureEsi({ getToken: null });
});

describe('loadCharacterSolarSystemId', () => {
  it('fetches and caches the current solar system id', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHARACTER_ID}/location`, () =>
        HttpResponse.json({ solar_system_id: 30000142 })
      )
    );

    const systemId = await loadCharacterSolarSystemId(CHARACTER_ID);

    expect(systemId).toBe(30000142);
    expect((await db.esiCache.get([CHARACTER_ID, 'characterLocation']))?.value).toBe(30000142);
  });

  it('re-reads ESI on a later page load rather than serving a minutes-old location', async () => {
    let systemId = 30000142;
    let calls = 0;
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHARACTER_ID}/location`, () => {
        calls += 1;
        return HttpResponse.json({ solar_system_id: systemId });
      })
    );
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      expect(await loadCharacterSolarSystemId(CHARACTER_ID)).toBe(30000142);

      // Same page load asking again: inside the 5 s TTL, no second call.
      expect(await loadCharacterSolarSystemId(CHARACTER_ID)).toBe(30000142);
      expect(calls).toBe(1);

      // The pilot flew on; opening another page 30 s later must see it.
      systemId = 30002187;
      vi.setSystemTime(Date.now() + 30_000);
      expect(await loadCharacterSolarSystemId(CHARACTER_ID)).toBe(30002187);
      expect(calls).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns null on a 403 (missing grant) WITHOUT signalling a re-auth failure', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHARACTER_ID}/location`, () =>
        HttpResponse.json({ error: 'Forbidden' }, { status: 403 })
      )
    );
    const authFailures: number[] = [];
    const unsubscribe = onEsiAuthFailure((characterId) => authFailures.push(characterId));

    const systemId = await loadCharacterSolarSystemId(CHARACTER_ID);

    unsubscribe();
    expect(systemId).toBeNull();
    expect(authFailures).toEqual([]);
  });

  it('returns null when unresolvable (offline + uncached)', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHARACTER_ID}/location`, () => HttpResponse.error())
    );

    const systemId = await loadCharacterSolarSystemId(CHARACTER_ID);

    expect(systemId).toBeNull();
  });
});
