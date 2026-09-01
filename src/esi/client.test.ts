import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import {
  esiFetch,
  configureEsi,
  EsiError,
  isAuthFailure,
  ESI_BASE_URL,
  COMPATIBILITY_DATE,
  USER_AGENT,
} from './client';
import { AuthError } from '@/auth/sso';
import { rejectBadEsiHeaders } from './test-helpers';
import { onEsiActivity, type ActivityEvent } from './activityLog';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  configureEsi({ getToken: null });
});
afterAll(() => server.close());

/** Yield to the event loop until esiFetch has scheduled its retry timer. */
async function untilTimerScheduled(): Promise<void> {
  while (vi.getTimerCount() === 0) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

describe('esiFetch — public requests', () => {
  it('sends X-Compatibility-Date and X-User-Agent, no Authorization, and parses the envelope', async () => {
    let captured: Headers | null = null;
    server.use(
      http.get(`${ESI_BASE_URL}/alliances/99000001`, ({ request }) => {
        captured = request.headers;
        return HttpResponse.json(
          { name: 'Test Alliance', ticker: 'TEST' },
          { headers: { ETag: '"abc123"', Expires: 'Sat, 29 Aug 2026 12:00:00 GMT' } }
        );
      })
    );

    const result = await esiFetch<{ name: string; ticker: string }>('/alliances/99000001');

    expect(result.data).toEqual({ name: 'Test Alliance', ticker: 'TEST' });
    expect(result.etag).toBe('"abc123"');
    expect(result.pages).toBe(1);
    expect(result.expires).toBe('Sat, 29 Aug 2026 12:00:00 GMT');
    const headers = captured as Headers | null;
    expect(headers?.get('x-compatibility-date')).toBe(COMPATIBILITY_DATE);
    expect(headers?.get('x-user-agent')).toBe(USER_AGENT);
    expect(headers?.get('authorization')).toBeNull();
  });

  it('serializes query params and page', async () => {
    let url: URL | null = null;
    server.use(
      http.get(`${ESI_BASE_URL}/markets/10000002/orders`, ({ request }) => {
        url = new URL(request.url);
        return HttpResponse.json([]);
      })
    );

    await esiFetch('/markets/10000002/orders', {
      query: { type_id: 34, order_type: 'sell' },
      page: 2,
    });

    const parsed = url as URL | null;
    expect(parsed?.searchParams.get('type_id')).toBe('34');
    expect(parsed?.searchParams.get('order_type')).toBe('sell');
    expect(parsed?.searchParams.get('page')).toBe('2');
  });

  it('parses X-Pages into pages', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/markets/10000002/orders`, () =>
        HttpResponse.json([], { headers: { 'X-Pages': '5' } })
      )
    );

    const result = await esiFetch('/markets/10000002/orders');
    expect(result.pages).toBe(5);
  });
});

describe('esiFetch — authenticated requests', () => {
  it('attaches a Bearer token from the injected getToken', async () => {
    const getToken = vi.fn(async (characterId: number) => `token-${characterId}`);
    configureEsi({ getToken });
    let auth: string | null = null;
    server.use(
      http.get(`${ESI_BASE_URL}/characters/123/wallet`, ({ request }) => {
        const bad = rejectBadEsiHeaders(request);
        if (bad) return bad;
        auth = request.headers.get('authorization');
        return HttpResponse.json(29500000.01);
      })
    );

    const result = await esiFetch<number>('/characters/123/wallet', { characterId: 123 });

    expect(result.data).toBe(29500000.01);
    expect(auth).toBe('Bearer token-123');
    expect(getToken).toHaveBeenCalledWith(123);
  });

  it('rejects when characterId is given but no getToken is configured', async () => {
    await expect(esiFetch('/characters/123/wallet', { characterId: 123 })).rejects.toThrow(
      /getToken/
    );
  });
});

describe('esiFetch — ETag / 304', () => {
  it('sends If-None-Match and returns null data on 304', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/alliances/99000001`, ({ request }) => {
        if (request.headers.get('if-none-match') === '"abc123"') {
          return new HttpResponse(null, { status: 304, headers: { ETag: '"abc123"' } });
        }
        return HttpResponse.json({ name: 'Test Alliance' });
      })
    );

    const result = await esiFetch('/alliances/99000001', { etag: '"abc123"' });

    expect(result.data).toBeNull();
    expect(result.etag).toBe('"abc123"');
  });
});

describe('esiFetch — rate limiting', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries once after 429, waiting Retry-After seconds', async () => {
    let attempts = 0;
    server.use(
      http.get(`${ESI_BASE_URL}/alliances/99000001`, () => {
        attempts += 1;
        if (attempts === 1) {
          return HttpResponse.json(
            { error: 'rate limited' },
            { status: 429, headers: { 'Retry-After': '3' } }
          );
        }
        return HttpResponse.json({ name: 'Test Alliance' });
      })
    );

    const promise = esiFetch<{ name: string }>('/alliances/99000001');
    await untilTimerScheduled();
    await vi.advanceTimersByTimeAsync(3000);
    const result = await promise;

    expect(attempts).toBe(2);
    expect(result.data).toEqual({ name: 'Test Alliance' });
  });

  it('caps the retry wait at 10 seconds', async () => {
    let attempts = 0;
    server.use(
      http.get(`${ESI_BASE_URL}/alliances/99000001`, () => {
        attempts += 1;
        if (attempts === 1) {
          return HttpResponse.json(
            { error: 'rate limited' },
            { status: 429, headers: { 'Retry-After': '60' } }
          );
        }
        return HttpResponse.json({ name: 'Test Alliance' });
      })
    );

    const promise = esiFetch('/alliances/99000001');
    await untilTimerScheduled();
    await vi.advanceTimersByTimeAsync(10_000);
    // If the wait were not capped, the 60s timer would still be pending here.
    expect(vi.getTimerCount()).toBe(0);
    const result = await promise;
    expect(attempts).toBe(2);
    expect(result.data).toEqual({ name: 'Test Alliance' });
  });

  it('retries once after 420, honoring X-ESI-Error-Limit-Reset', async () => {
    let attempts = 0;
    server.use(
      http.get(`${ESI_BASE_URL}/alliances/99000001`, () => {
        attempts += 1;
        if (attempts === 1) {
          return HttpResponse.json(
            { error: 'error limited' },
            {
              status: 420,
              headers: { 'X-ESI-Error-Limit-Reset': '2', 'X-ESI-Error-Limit-Remain': '0' },
            }
          );
        }
        return HttpResponse.json({ name: 'Test Alliance' });
      })
    );

    const promise = esiFetch('/alliances/99000001');
    await untilTimerScheduled();
    await vi.advanceTimersByTimeAsync(2000);
    const result = await promise;

    expect(attempts).toBe(2);
    expect(result.data).toEqual({ name: 'Test Alliance' });
  });

  it('throws EsiError when the single retry is also rate limited', async () => {
    let attempts = 0;
    server.use(
      http.get(`${ESI_BASE_URL}/alliances/99000001`, () => {
        attempts += 1;
        return HttpResponse.json(
          { error: 'rate limited' },
          { status: 429, headers: { 'Retry-After': '1' } }
        );
      })
    );

    const promise = esiFetch('/alliances/99000001');
    const assertion = expect(promise).rejects.toMatchObject({ status: 429 });
    await untilTimerScheduled();
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    await expect(promise).rejects.toBeInstanceOf(EsiError);
    expect(attempts).toBe(2);
  });
});

describe('esiFetch — errors', () => {
  it('throws a typed EsiError with the message from the response body', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/999`, () =>
        HttpResponse.json({ error: 'Character not found' }, { status: 404 })
      )
    );

    let caught: unknown;
    try {
      await esiFetch('/characters/999');
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(EsiError);
    const esiError = caught as EsiError;
    expect(esiError.status).toBe(404);
    expect(esiError.message).toBe('Character not found');
    expect(esiError.body).toEqual({ error: 'Character not found' });
  });

  it('falls back to a status message when the error body is not JSON', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/999`, () => new HttpResponse('boom', { status: 500 }))
    );

    await expect(esiFetch('/characters/999')).rejects.toMatchObject({
      status: 500,
      message: expect.stringContaining('500'),
    });
  });
});

describe('esiFetch — POST (BUG #12)', () => {
  it('sends a JSON body with Content-Type and the standard compat/user-agent headers', async () => {
    let captured: Headers | null = null;
    let body: unknown;
    server.use(
      http.post(`${ESI_BASE_URL}/universe/names`, async ({ request }) => {
        captured = request.headers;
        body = await request.json();
        return HttpResponse.json([{ id: 34, name: 'Tritanium', category: 'inventory_type' }]);
      })
    );

    const result = await esiFetch<unknown>('/universe/names', {
      method: 'POST',
      body: [34],
    });

    expect(body).toEqual([34]);
    expect(result.data).toEqual([{ id: 34, name: 'Tritanium', category: 'inventory_type' }]);
    const headers = captured as Headers | null;
    expect(headers?.get('content-type')).toContain('application/json');
    expect(headers?.get('x-compatibility-date')).toBe(COMPATIBILITY_DATE);
    expect(headers?.get('x-user-agent')).toBe(USER_AGENT);
  });

  it('throws a typed EsiError on a POST error response', async () => {
    server.use(
      http.post(`${ESI_BASE_URL}/universe/names`, () => new HttpResponse(null, { status: 404 }))
    );

    await expect(
      esiFetch('/universe/names', { method: 'POST', body: [999999999] })
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('esiFetch — POST rate limiting (BUG #12)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries a POST once after 429, resending the body', async () => {
    let attempts = 0;
    const bodies: unknown[] = [];
    server.use(
      http.post(`${ESI_BASE_URL}/universe/names`, async ({ request }) => {
        attempts += 1;
        bodies.push(await request.json());
        if (attempts === 1) {
          return HttpResponse.json(
            { error: 'rate limited' },
            { status: 429, headers: { 'Retry-After': '3' } }
          );
        }
        return HttpResponse.json([{ id: 34, name: 'Tritanium', category: 'inventory_type' }]);
      })
    );

    const promise = esiFetch('/universe/names', { method: 'POST', body: [34] });
    await untilTimerScheduled();
    await vi.advanceTimersByTimeAsync(3000);
    const result = await promise;

    expect(attempts).toBe(2);
    expect(bodies).toEqual([[34], [34]]);
    expect(result.data).toEqual([{ id: 34, name: 'Tritanium', category: 'inventory_type' }]);
  });
});

describe('esiFetch — activity log (issue #32)', () => {
  function collectActivity(): { events: ActivityEvent[]; unsubscribe: () => void } {
    const events: ActivityEvent[] = [];
    const unsubscribe = onEsiActivity((event) => events.push(event));
    return { events, unsubscribe };
  }

  it('emits a success event with the route template endpoint id, never a built URL', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/123/skills`, () =>
        HttpResponse.json({ skills: [], total_sp: 0 })
      )
    );
    configureEsi({ getToken: async () => 'test-token' });
    const { events, unsubscribe } = collectActivity();

    await esiFetch('/characters/123/skills', {
      characterId: 123,
      endpointId: 'getCharacterSkills',
    });

    expect(events).toEqual([
      {
        endpointId: 'getCharacterSkills',
        characterId: 123,
        timestamp: expect.any(Number),
        outcome: 'success',
      },
    ]);
    unsubscribe();
  });

  it('emits an error event, never the raw ESI error body, on a non-auth failure', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/999`, () =>
        HttpResponse.json({ error: 'super secret internal detail' }, { status: 500 })
      )
    );
    const { events, unsubscribe } = collectActivity();

    await expect(
      esiFetch('/characters/999', { endpointId: 'getCharacterPublicInfo' })
    ).rejects.toThrow();

    expect(events).toEqual([
      {
        endpointId: 'getCharacterPublicInfo',
        characterId: undefined,
        timestamp: expect.any(Number),
        outcome: 'error',
      },
    ]);
    unsubscribe();
  });

  it('leak canary: an activity event from a real authenticated failure carries no token, id, or response body', async () => {
    const SECRET_TOKEN = 'super-secret-access-token';
    const SECRET_BODY = 'internal-stack-trace-do-not-leak';
    server.use(
      http.get(`${ESI_BASE_URL}/characters/456/wallet`, () =>
        HttpResponse.json({ error: SECRET_BODY }, { status: 401 })
      )
    );
    configureEsi({ getToken: async () => SECRET_TOKEN });
    const { events, unsubscribe } = collectActivity();

    await expect(
      esiFetch('/characters/456/wallet', { characterId: 456, endpointId: 'getCharacterWallet' })
    ).rejects.toThrow();

    expect(events).toHaveLength(1);
    const [event] = events;
    expect(Object.keys(event).sort()).toEqual(
      ['characterId', 'endpointId', 'outcome', 'timestamp'].sort()
    );
    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain(SECRET_TOKEN);
    expect(serialized).not.toContain(SECRET_BODY);
    expect(serialized).not.toContain('/characters/456/wallet');
    unsubscribe();
  });

  it('emits an authFailure event on 401/403, not a generic error', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/123/wallet`, () =>
        HttpResponse.json({ error: 'token invalid' }, { status: 401 })
      )
    );
    configureEsi({ getToken: async () => 'stale-token' });
    const { events, unsubscribe } = collectActivity();

    await expect(
      esiFetch('/characters/123/wallet', { characterId: 123, endpointId: 'getCharacterWallet' })
    ).rejects.toThrow();

    expect(events).toEqual([
      {
        endpointId: 'getCharacterWallet',
        characterId: 123,
        timestamp: expect.any(Number),
        outcome: 'authFailure',
      },
    ]);
    unsubscribe();
  });

  it('does not emit when the caller omits endpointId', async () => {
    server.use(http.get(`${ESI_BASE_URL}/alliances/99000001`, () => HttpResponse.json({})));
    const { events, unsubscribe } = collectActivity();

    await esiFetch('/alliances/99000001');

    expect(events).toEqual([]);
    unsubscribe();
  });

  it('does not emit for a cancelled (aborted) request', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/alliances/99000001`, async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return HttpResponse.json({});
      })
    );
    const { events, unsubscribe } = collectActivity();
    const controller = new AbortController();

    const promise = esiFetch('/alliances/99000001', {
      endpointId: 'getAlliancePublicInfo',
      signal: controller.signal,
    });
    controller.abort();

    await expect(promise).rejects.toThrow();
    expect(events).toEqual([]);
    unsubscribe();
  });
});

describe('isAuthFailure (BUG #3)', () => {
  it('is true for a 401 EsiError', () => {
    expect(isAuthFailure(new EsiError(401, 'bad token'))).toBe(true);
  });

  it('is true for a 403 EsiError', () => {
    expect(isAuthFailure(new EsiError(403, 'missing scope'))).toBe(true);
  });

  it('is false for other EsiError statuses (offline-ish/5xx should still fall back to cache)', () => {
    expect(isAuthFailure(new EsiError(500, 'boom'))).toBe(false);
    expect(isAuthFailure(new EsiError(404, 'not found'))).toBe(false);
  });

  it('is true for an AuthError (refresh-token failure, never reaches esiFetch)', () => {
    expect(isAuthFailure(new AuthError('invalid_grant', 'token revoked', 400))).toBe(true);
  });

  it('is false for a plain network error', () => {
    expect(isAuthFailure(new TypeError('Failed to fetch'))).toBe(false);
    expect(isAuthFailure(new Error('boom'))).toBe(false);
  });
});
