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
import {
  resetEsiBudget,
  esiBudgetSnapshot,
  esiInFlight,
  EsiBudgetError,
  ESI_MAX_IN_FLIGHT,
} from './budget';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  configureEsi({ getToken: null });
  // The budget is app-wide module state: a test that deliberately serves a 420
  // would otherwise shut the circuit for every test that follows it.
  resetEsiBudget();
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

  it('does not retry a wait longer than the bound — it fails fast into the cache instead (issue #655)', async () => {
    // We absorb a hiccup, we do not absorb an outage: a minute-long window is
    // answered from the cache immediately rather than by sleeping on it, and
    // the retry that is not made spends nothing against the error budget.
    let attempts = 0;
    server.use(
      http.get(`${ESI_BASE_URL}/alliances/99000001`, () => {
        attempts += 1;
        return HttpResponse.json(
          { error: 'rate limited' },
          { status: 429, headers: { 'Retry-After': '60' } }
        );
      })
    );

    await expect(esiFetch('/alliances/99000001')).rejects.toMatchObject({ status: 429 });

    expect(attempts).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
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

describe('esiFetch — app-wide error budget (issue #655)', () => {
  it('reads the error-limit headers off a successful response, not only off a failure', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/alliances/99000001`, () =>
        HttpResponse.json(
          { name: 'Test Alliance' },
          { headers: { 'X-ESI-Error-Limit-Remain': '73', 'X-ESI-Error-Limit-Reset': '41' } }
        )
      )
    );

    await esiFetch('/alliances/99000001');

    expect(esiBudgetSnapshot().errorRemain).toBe(73);
    expect(esiBudgetSnapshot().errorResetAt).not.toBeNull();
  });

  it('reads them off a 304 too', async () => {
    server.use(
      http.get(
        `${ESI_BASE_URL}/alliances/99000001`,
        () =>
          new HttpResponse(null, {
            status: 304,
            headers: { 'X-ESI-Error-Limit-Remain': '55', 'X-ESI-Error-Limit-Reset': '12' },
          })
      )
    );

    await esiFetch('/alliances/99000001', { etag: '"abc"' });

    expect(esiBudgetSnapshot().errorRemain).toBe(55);
  });

  it('shuts the circuit on a 420, so the rest of a fan-out never reaches the network', async () => {
    let structureRequests = 0;
    let mailRequests = 0;
    server.use(
      http.get(`${ESI_BASE_URL}/universe/structures/1`, () => {
        structureRequests += 1;
        return HttpResponse.json(
          { error: 'error limited' },
          { status: 420, headers: { 'X-ESI-Error-Limit-Reset': '45' } }
        );
      }),
      http.get(`${ESI_BASE_URL}/characters/123/mail`, () => {
        mailRequests += 1;
        return HttpResponse.json([]);
      })
    );

    await expect(esiFetch('/universe/structures/1')).rejects.toMatchObject({ status: 420 });
    // The unrelated read behind it — a different route, a different Character —
    // is the one the user's log showed being 420'd for free. It is not sent.
    await expect(esiFetch('/characters/123/mail')).rejects.toBeInstanceOf(EsiBudgetError);

    expect(structureRequests).toBe(1);
    expect(mailRequests).toBe(0);
  });

  it('refuses with a status of 0 — no request was made, so ESI said nothing', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/universe/structures/1`, () =>
        HttpResponse.json(
          { error: 'error limited' },
          { status: 420, headers: { 'X-ESI-Error-Limit-Reset': '45' } }
        )
      )
    );
    await expect(esiFetch('/universe/structures/1')).rejects.toThrow();

    let caught: unknown;
    try {
      await esiFetch('/alliances/99000001');
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(EsiError);
    // Not 420: reporting a status ESI never sent would make
    // `features/character/typeNames.ts` answer a spent budget by fanning out a
    // thousand per-id lookups. `reason` carries which limit is holding.
    expect((caught as EsiError).status).toBe(0);
    expect(caught).toMatchObject({ reason: 'errorLimit' });
    // `esi/cache.ts` falls back to the stored row for anything that is not an
    // auth failure; a shut circuit must land there, not on a re-auth banner.
    expect(isAuthFailure(caught)).toBe(false);
  });

  it('logs no activity for a request it declined to send', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/universe/structures/1`, () =>
        HttpResponse.json(
          { error: 'error limited' },
          { status: 420, headers: { 'X-ESI-Error-Limit-Reset': '45' } }
        )
      )
    );
    await expect(
      esiFetch('/universe/structures/1', { endpointId: 'getUniverseStructure' })
    ).rejects.toThrow();

    const events: ActivityEvent[] = [];
    const unsubscribe = onEsiActivity((event) => events.push(event));
    await expect(
      esiFetch('/characters/123/mail', { endpointId: 'getCharacterMailHeaders' })
    ).rejects.toBeInstanceOf(EsiBudgetError);

    // No route was called, so there is no ESI activity — the same reasoning
    // that exempts a cancelled load. Otherwise /settings fills with errors for
    // zero traffic during a throttle.
    expect(events).toEqual([]);
    unsubscribe();
  });

  it('reopens the circuit as soon as ESI answers again', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/alliances/99000001`, () =>
        HttpResponse.json(
          { error: 'rate limited' },
          { status: 429, headers: { 'Retry-After': '0' } }
        )
      ),
      http.get(`${ESI_BASE_URL}/alliances/99000002`, () => HttpResponse.json({ name: 'Second' }))
    );

    await expect(esiFetch('/alliances/99000001')).rejects.toThrow();
    const result = await esiFetch<{ name: string }>('/alliances/99000002');

    expect(result.data).toEqual({ name: 'Second' });
    expect(esiBudgetSnapshot().circuitUntil).toBeNull();
  });

  it('gives its in-flight permit back on success and on failure', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/alliances/99000001`, () => HttpResponse.json({ name: 'A' })),
      http.get(`${ESI_BASE_URL}/characters/999`, () => new HttpResponse(null, { status: 500 }))
    );

    await esiFetch('/alliances/99000001');
    expect(esiInFlight()).toBe(0);
    await expect(esiFetch('/characters/999')).rejects.toThrow();
    expect(esiInFlight()).toBe(0);
  });

  it('holds the whole app to one in-flight ceiling, not one per call site', async () => {
    let concurrent = 0;
    let peak = 0;
    server.use(
      http.get(`${ESI_BASE_URL}/universe/types/:id`, async () => {
        concurrent += 1;
        peak = Math.max(peak, concurrent);
        await new Promise((resolve) => setTimeout(resolve, 5));
        concurrent -= 1;
        return HttpResponse.json({ name: 'Tritanium' });
      })
    );

    // Three independent fan-outs, each already capped at its own call site.
    await Promise.all(
      Array.from({ length: ESI_MAX_IN_FLIGHT * 3 }, (_, i) => esiFetch(`/universe/types/${i}`))
    );

    expect(peak).toBeLessThanOrEqual(ESI_MAX_IN_FLIGHT);
    expect(esiInFlight()).toBe(0);
  });

  it('honours an AbortSignal raised while the caller is queued at the gate', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/universe/types/:id`, async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        return HttpResponse.json({ name: 'Tritanium' });
      })
    );

    const holders = Array.from({ length: ESI_MAX_IN_FLIGHT }, (_, i) =>
      esiFetch(`/universe/types/${i}`)
    );
    const controller = new AbortController();
    const queued = esiFetch('/universe/types/999', { signal: controller.signal });
    controller.abort();

    await expect(queued).rejects.toThrow();
    await Promise.all(holders);
    expect(esiInFlight()).toBe(0);
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

describe('esiFetch — PUT (issue #741)', () => {
  it('sends a JSON body with Content-Type and the standard compat/user-agent headers', async () => {
    let captured: Headers | null = null;
    let body: unknown;
    server.use(
      http.put(`${ESI_BASE_URL}/characters/1/mail/2/`, async ({ request }) => {
        captured = request.headers;
        body = await request.json();
        return new HttpResponse(null, { status: 204 });
      })
    );

    await esiFetch<void>('/characters/1/mail/2/', { method: 'PUT', body: { read: true } });

    expect(body).toEqual({ read: true });
    const headers = captured as Headers | null;
    expect(headers?.get('content-type')).toContain('application/json');
    expect(headers?.get('x-compatibility-date')).toBe(COMPATIBILITY_DATE);
    expect(headers?.get('x-user-agent')).toBe(USER_AGENT);
  });

  it('resolves with null data on a 204 No Content response instead of throwing on the empty body', async () => {
    server.use(
      http.put(
        `${ESI_BASE_URL}/characters/1/mail/2/`,
        () => new HttpResponse(null, { status: 204 })
      )
    );

    const result = await esiFetch<void>('/characters/1/mail/2/', {
      method: 'PUT',
      body: { read: true },
    });

    expect(result.data).toBeNull();
  });

  it('throws a typed EsiError on a PUT error response', async () => {
    server.use(
      http.put(
        `${ESI_BASE_URL}/characters/1/mail/2/`,
        () => new HttpResponse(null, { status: 403 })
      )
    );

    await expect(
      esiFetch('/characters/1/mail/2/', { method: 'PUT', body: { read: true } })
    ).rejects.toMatchObject({ status: 403 });
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
