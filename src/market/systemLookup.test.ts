import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { ESI_BASE_URL } from '@/esi/client';
import { rejectBadEsiHeaders } from '@/esi/test-helpers';
import { resolveSolarSystem, clearSystemLookupCache } from './systemLookup';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => clearSystemLookupCache());

/** Counts posts so the cache can be asserted on, and pins the mandatory headers. */
function idsHandler(body: Record<string, unknown>, onCall?: () => void) {
  return http.post(`${ESI_BASE_URL}/universe/ids`, ({ request }) => {
    const bad = rejectBadEsiHeaders(request);
    if (bad) return bad;
    onCall?.();
    return HttpResponse.json(body);
  });
}

describe('resolveSolarSystem', () => {
  it('resolves a system name to its id, in ESI casing', async () => {
    server.use(idsHandler({ systems: [{ id: 30003888, name: 'Badivefi' }] }));

    expect(await resolveSolarSystem('badivefi')).toEqual({ id: 30003888, name: 'Badivefi' });
  });

  it('ignores non-system matches on a name shared with a corporation', async () => {
    server.use(
      idsHandler({
        corporations: [{ id: 148134386, name: 'Amarr Trading and Manufactoring' }],
        systems: [{ id: 30002187, name: 'Amarr' }],
      })
    );

    expect(await resolveSolarSystem('Amarr')).toEqual({ id: 30002187, name: 'Amarr' });
  });

  it('returns null for a name ESI does not know', async () => {
    server.use(idsHandler({ corporations: [{ id: 1, name: 'Nope Inc' }] }));

    expect(await resolveSolarSystem('Nope Inc')).toBeNull();
  });

  it('returns null for a blank name without calling ESI', async () => {
    // No handler registered: onUnhandledRequest 'error' fails the test on a call.
    expect(await resolveSolarSystem('   ')).toBeNull();
  });

  it('caches a resolution across calls, case-insensitively', async () => {
    let calls = 0;
    server.use(idsHandler({ systems: [{ id: 30003888, name: 'Badivefi' }] }, () => (calls += 1)));

    await resolveSolarSystem('Badivefi');
    await resolveSolarSystem('BADIVEFI');

    expect(calls).toBe(1);
  });

  it('does not cache an ESI failure, so the next edit retries', async () => {
    let calls = 0;
    server.use(
      http.post(`${ESI_BASE_URL}/universe/ids`, () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json({ error: 'boom' }, { status: 500 })
          : HttpResponse.json({ systems: [{ id: 30003888, name: 'Badivefi' }] });
      })
    );

    expect(await resolveSolarSystem('Badivefi')).toBeNull();
    expect(await resolveSolarSystem('Badivefi')).toEqual({ id: 30003888, name: 'Badivefi' });
  });
});
