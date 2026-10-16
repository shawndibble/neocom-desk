import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { ESI_BASE_URL } from '@/esi/client';
import { rejectBadEsiHeaders } from '@/esi/test-helpers';
import { db } from '@/db';
import { clearSolarSystemIndex } from '@/sde/solarSystems';
import { resolveSolarSystem, clearSystemLookupCache } from './systemLookup';

const server = setupServer();

const found = (system: object) => ({ status: 'found', system });

// The local solar-system table. Tests that exercise the ESI fallback make it unreadable.
const LOCAL_SYSTEMS = [{ id: 30000142, name: 'Jita', security: 0.9459, regionId: 10000002 }];
let localTable: 'ok' | 'down' = 'down';
vi.mock('@/sde/loadMarketSde', () => ({
  loadSolarSystems: async () => {
    if (localTable === 'down') throw new Error('offline');
    return LOCAL_SYSTEMS;
  },
}));

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(async () => {
  localTable = 'down';
  clearSolarSystemIndex();
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

    expect(await resolveSolarSystem('badivefi')).toEqual(
      found({
        id: 30003888,
        name: 'Badivefi',
        security: 'highsec',
      })
    );
  });

  it("bands the security the way the game does, not on ESI's raw float", () => {
    // Balle: 0.4608891 in ESI, a 0.5 highsec system in game.
    server.use(
      idsHandler({ systems: [{ id: 30003888, name: 'Badivefi' }] }),
      systemHandler(0.4609)
    );

    return expect(resolveSolarSystem('Badivefi')).resolves.toMatchObject({
      system: { security: 'highsec' },
    });
  });

  it('does not cache a resolution whose band failed, so the next edit retries', async () => {
    let securityCalls = 0;
    server.use(
      idsHandler({ systems: [{ id: 30003888, name: 'Badivefi' }] }),
      http.get(`${ESI_BASE_URL}/universe/systems/:id`, ({ params }) => {
        securityCalls += 1;
        return securityCalls === 1
          ? HttpResponse.error()
          : HttpResponse.json({
              system_id: Number(params.id),
              name: 'Badivefi',
              security_status: 0.6587,
            });
      })
    );

    expect(await resolveSolarSystem('Badivefi')).toMatchObject({ system: { security: null } });
    await db.esiCache.clear();
    expect(await resolveSolarSystem('Badivefi')).toMatchObject({ system: { security: 'highsec' } });
  });

  it('resolves the system with a null band when the security lookup fails', async () => {
    // The name is still good; the caller keeps the band it has rather than
    // guessing a rig multiplier from nothing.
    server.use(
      idsHandler({ systems: [{ id: 30003888, name: 'Badivefi' }] }),
      http.get(`${ESI_BASE_URL}/universe/systems/:id`, () => HttpResponse.error())
    );

    expect(await resolveSolarSystem('Badivefi')).toEqual(
      found({
        id: 30003888,
        name: 'Badivefi',
        security: null,
      })
    );
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

    expect(await resolveSolarSystem('Amarr')).toEqual(
      found({
        id: 30002187,
        name: 'Amarr',
        security: 'highsec',
      })
    );
  });

  it('returns notFound for a name ESI does not know', async () => {
    server.use(idsHandler({ corporations: [{ id: 1, name: 'Nope Inc' }] }));

    expect(await resolveSolarSystem('Nope Inc')).toEqual({ status: 'notFound' });
  });

  it('returns notFound for a blank name without calling ESI', async () => {
    // No handler registered: onUnhandledRequest 'error' fails the test on a call.
    expect(await resolveSolarSystem('   ')).toEqual({ status: 'notFound' });
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

    expect(await resolveSolarSystem('Badivefi')).toEqual({ status: 'unavailable' });
    expect(await resolveSolarSystem('Badivefi')).toEqual(
      found({
        id: 30003888,
        name: 'Badivefi',
        security: 'highsec',
      })
    );
  });
});

describe('resolveSolarSystem from the local solar-system table', () => {
  beforeEach(() => {
    localTable = 'ok';
  });

  it('resolves a name with no ESI call at all', async () => {
    // No ESI handler registered: onUnhandledRequest 'error' fails on any call.
    expect(await resolveSolarSystem('jita')).toEqual(
      found({
        id: 30000142,
        name: 'Jita',
        security: 'highsec',
      })
    );
  });

  it('asks ESI for a name the table lacks (the snapshot can lag the game)', async () => {
    server.use(
      idsHandler({ systems: [{ id: 30009999, name: 'Newsystem' }] }),
      http.get(`${ESI_BASE_URL}/universe/systems/:id`, () =>
        HttpResponse.json({ system_id: 30009999, name: 'Newsystem', security_status: -0.3 })
      )
    );

    expect(await resolveSolarSystem('Newsystem')).toEqual(
      found({ id: 30009999, name: 'Newsystem', security: 'nullsec' })
    );
  });

  it('says notFound only once ESI also finds no such system', async () => {
    server.use(idsHandler({}));

    expect(await resolveSolarSystem('Nowhere')).toEqual({ status: 'notFound' });
  });

  it('says unavailable, not notFound, for a missing name when ESI is unreachable', async () => {
    server.use(http.post(`${ESI_BASE_URL}/universe/ids`, () => HttpResponse.error()));

    expect(await resolveSolarSystem('Nowhere')).toEqual({ status: 'unavailable' });
  });
});
