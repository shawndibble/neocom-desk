import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import { loadSystemSecurity, readCachedSystemSecurity } from './systemSecurity';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(async () => {
  await db.esiCache.clear();
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('loadSystemSecurity', () => {
  it('fetches and caches the security status under the global sentinel', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/universe/systems/30000142`, () =>
        HttpResponse.json({
          system_id: 30000142,
          name: 'Jita',
          security_status: 0.9459,
        })
      )
    );

    const security = await loadSystemSecurity(30000142);

    expect(security).toBeCloseTo(0.9459);
    expect((await db.esiCache.get([0, 'system:30000142']))?.value).toMatchObject({
      security_status: expect.closeTo(0.9459),
    });
  });

  it('returns null when unresolvable (offline + uncached)', async () => {
    server.use(http.get(`${ESI_BASE_URL}/universe/systems/30000001`, () => HttpResponse.error()));

    const security = await loadSystemSecurity(30000001);

    expect(security).toBeNull();
  });
});

describe('readCachedSystemSecurity', () => {
  it('never fetches: returns null for a system nothing has cached yet', async () => {
    // `onUnhandledRequest: 'error'` on the shared server means an accidental
    // live call here fails the test rather than silently passing.
    const security = await readCachedSystemSecurity(30000142);

    expect(security).toBeNull();
  });

  it('reads a system another caller already cached, with no request of its own', async () => {
    await db.esiCache.put({
      characterId: 0,
      key: 'system:30000142',
      value: { system_id: 30000142, name: 'Jita', security_status: 0.9459 },
      fetchedAt: Date.now(),
    });

    const security = await readCachedSystemSecurity(30000142);

    expect(security).toBeCloseTo(0.9459);
  });
});
