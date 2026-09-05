import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { ESI_BASE_URL } from '@/esi/client';
import { rejectBadEsiHeaders } from '@/esi/test-helpers';
import { db } from '@/db';
import { resolveSolarSystem, clearSystemLookupCache } from './systemLookup';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(async () => {
  clearSystemLookupCache();
  await db.esiCache.clear();
});

/** `/universe/systems/{id}`, which is where the security band comes from. */
function systemHandler(security: number) {
  return http.get(`${ESI_BASE_URL}/universe/systems/:id`, ({ params }) =>
    HttpResponse.json({
      system_id: Number(params.id),
      name: 'Badivefi',
      security_status: security,
    })
  );
}

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
    server.use(
      idsHandler({ systems: [{ id: 30003888, name: 'Badivefi' }] }),
      systemHandler(0.6587)
    );

    expect(await resolveSolarSystem('badivefi')).toEqual({
      id: 30003888,
      name: 'Badivefi',
      security: 'highsec',
    });
  });

  it("bands the security the way the game does, not on ESI's raw float", () => {
    // Balle: 0.4608891 in ESI, a 0.5 highsec system in game.
    server.use(
      idsHandler({ systems: [{ id: 30003888, name: 'Badivefi' }] }),
      systemHandler(0.4609)
    );

    return expect(resolveSolarSystem('Badivefi')).resolves.toMatchObject({ security: 'highsec' });
  });

  it('resolves the system with a null band when the security lookup fails', async () => {
    // The name is still good; the caller keeps the band it has rather than
    // guessing a rig multiplier from nothing.
    server.use(
      idsHandler({ systems: [{ id: 30003888, name: 'Badivefi' }] }),
      http.get(`${ESI_BASE_URL}/universe/systems/:id`, () => HttpResponse.error())
    );

    expect(await resolveSolarSystem('Badivefi')).toEqual({
      id: 30003888,
      name: 'Badivefi',
      security: null,
    });
  });

  it('ignores non-system matches on a name shared with a corporation', async () => {
    server.use(
      idsHandler({
        corporations: [{ id: 148134386, name: 'Amarr Trading and Manufactoring' }],
        systems: [{ id: 30002187, name: 'Amarr' }],
      }),
      http.get(`${ESI_BASE_URL}/universe/systems/:id`, ({ params }) =>
        HttpResponse.json({ system_id: Number(params.id), name: 'Amarr', security_status: 0.949 })
      )
    );

    expect(await resolveSolarSystem('Amarr')).toEqual({
      id: 30002187,
      name: 'Amarr',
      security: 'highsec',
    });
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
    server.use(
      idsHandler({ systems: [{ id: 30003888, name: 'Badivefi' }] }, () => (calls += 1)),
      systemHandler(0.6587)
    );

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
      }),
      systemHandler(0.6587)
    );

    expect(await resolveSolarSystem('Badivefi')).toBeNull();
    expect(await resolveSolarSystem('Badivefi')).toEqual({
      id: 30003888,
      name: 'Badivefi',
      security: 'highsec',
    });
  });
});
