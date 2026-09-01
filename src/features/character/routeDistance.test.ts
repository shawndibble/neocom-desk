import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import { loadJumpsAway } from './routeDistance';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(async () => {
  await db.esiCache.clear();
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('loadJumpsAway', () => {
  it('is 0 jumps without a network call when origin and destination are the same system', async () => {
    const result = await loadJumpsAway(30000142, 30000142, 'shortest');
    expect(result).toEqual({ kind: 'known', jumps: 0 });
  });

  it('resolves jumps from the ESI route waypoint list', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/latest/route/30000142/30002187`, () =>
        HttpResponse.json([30000142, 30002053, 30002187])
      )
    );

    const result = await loadJumpsAway(30000142, 30002187, 'shortest');

    expect(result).toEqual({ kind: 'known', jumps: 2 });
  });

  it('sends the app\'s "safest" preference as ESI\'s real "secure" flag value', async () => {
    // ESI's actual /route/ enum is shortest/secure/insecure — verified live
    // against the endpoint; fastest/safest both 400. "Safest" is this app's
    // own UI wording (per issue #87), translated at the ESI boundary.
    let capturedFlag: string | null = null;
    server.use(
      http.get(`${ESI_BASE_URL}/latest/route/30000142/30002187`, ({ request }) => {
        capturedFlag = new URL(request.url).searchParams.get('flag');
        return HttpResponse.json([30000142, 30002187]);
      })
    );

    await loadJumpsAway(30000142, 30002187, 'safest');

    expect(capturedFlag).toBe('secure');
  });

  it('sends the app\'s "shortest" preference as ESI\'s "shortest" flag value unchanged', async () => {
    let capturedFlag: string | null = null;
    server.use(
      http.get(`${ESI_BASE_URL}/latest/route/30000142/30002187`, ({ request }) => {
        capturedFlag = new URL(request.url).searchParams.get('flag');
        return HttpResponse.json([30000142, 30002187]);
      })
    );

    await loadJumpsAway(30000142, 30002187, 'shortest');

    expect(capturedFlag).toBe('shortest');
  });

  it('returns unknown/noRoute when the route cannot be resolved', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/latest/route/30000142/30999999`, () => HttpResponse.error())
    );

    const result = await loadJumpsAway(30000142, 30999999, 'shortest');

    expect(result).toEqual({ kind: 'unknown', reason: 'noRoute' });
  });
});
