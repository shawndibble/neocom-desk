/**
 * The search behind the Build Plan's location field: ids from
 * `/characters/{id}/search`, then one lookup per hit, then the mapping into
 * fields a plan can take.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { ESI_BASE_URL, configureEsi } from '@/esi/client';
import { db } from '@/db';
import { searchBuildLocations } from './searchBuildLocations';

const server = setupServer();
const CHAR_ID = 91;

const AZBEL_ID = 1035466617946;
const FORTIZAR_ID = 1035466617947;
const JITA_44 = 60003760;

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
  configureEsi({ getToken: async () => 'token' });
});
afterEach(() => server.resetHandlers());
afterAll(() => {
  server.close();
  configureEsi({ getToken: null });
});
beforeEach(async () => {
  await db.esiCache.clear();
});

function searchHandler(body: Record<string, number[]>, onCall?: (url: URL) => void) {
  return http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/search`, ({ request }) => {
    onCall?.(new URL(request.url));
    return HttpResponse.json(body);
  });
}

const structureHandler = http.get(`${ESI_BASE_URL}/universe/structures/:id`, ({ params }) => {
  const id = Number(params.id);
  if (id === AZBEL_ID) {
    return HttpResponse.json({
      name: 'K2-18 R&D',
      owner_id: 98,
      solar_system_id: 30003888,
      type_id: 35826, // Azbel
    });
  }
  return HttpResponse.json({
    name: 'K2-18 Market',
    owner_id: 98,
    solar_system_id: 30003888,
    type_id: 35833, // Fortizar — cannot manufacture
  });
});

const stationHandler = http.get(`${ESI_BASE_URL}/universe/stations/:id`, ({ params }) =>
  HttpResponse.json({
    station_id: Number(params.id),
    name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant',
    type_id: 1529,
    system_id: 30000142,
  })
);

const systemHandler = http.get(`${ESI_BASE_URL}/universe/systems/:id`, ({ params }) => {
  const id = Number(params.id);
  return HttpResponse.json(
    id === 30003888
      ? { system_id: id, name: 'Badivefi', security_status: 0.6587 }
      : { system_id: id, name: 'Jita', security_status: 0.9459 }
  );
});

describe('searchBuildLocations', () => {
  it('turns a structure hit into every field picking it would set', async () => {
    server.use(searchHandler({ structure: [AZBEL_ID] }), structureHandler, systemHandler);

    expect(await searchBuildLocations(CHAR_ID, 'K2-18')).toEqual([
      {
        structureId: AZBEL_ID,
        name: 'K2-18 R&D',
        facility: 'azbel',
        systemId: 30003888,
        systemName: 'Badivefi',
        security: 'highsec',
      },
    ]);
  });

  it('finds NPC stations too, as the npcStation facility', async () => {
    server.use(searchHandler({ station: [JITA_44] }), stationHandler, systemHandler);

    const [found] = await searchBuildLocations(CHAR_ID, 'Jita IV');

    expect(found).toMatchObject({
      facility: 'npcStation',
      systemName: 'Jita',
      security: 'highsec',
    });
  });

  it('drops a structure that cannot host a manufacturing job', async () => {
    // A Fortizar is a Citadel: no Manufacturing Plant service module exists for it.
    server.use(
      searchHandler({ structure: [AZBEL_ID, FORTIZAR_ID] }),
      structureHandler,
      systemHandler
    );

    const found = await searchBuildLocations(CHAR_ID, 'K2-18');

    expect(found.map((o) => o.name)).toEqual(['K2-18 R&D']);
  });

  it('survives a structure that left the ACL between the search and the lookup', async () => {
    server.use(
      searchHandler({ structure: [AZBEL_ID, FORTIZAR_ID] }),
      http.get(`${ESI_BASE_URL}/universe/structures/:id`, ({ params }) =>
        Number(params.id) === AZBEL_ID
          ? HttpResponse.json({
              name: 'K2-18 R&D',
              owner_id: 98,
              solar_system_id: 30003888,
              type_id: 35826,
            })
          : HttpResponse.json({ error: 'Forbidden' }, { status: 403 })
      ),
      systemHandler
    );

    expect((await searchBuildLocations(CHAR_ID, 'K2-18')).map((o) => o.name)).toEqual([
      'K2-18 R&D',
    ]);
  });

  it('caps the lookups across both categories, not once each', async () => {
    // 20 stations and 20 structures used to mean 30 lookups; now it is 15
    // total, interleaved so neither category can crowd the other out.
    const many = (base: number) => Array.from({ length: 20 }, (_, i) => base + i);
    let lookups = 0;
    server.use(
      searchHandler({ station: many(60000000), structure: many(1035000000000) }),
      http.get(`${ESI_BASE_URL}/universe/stations/:id`, ({ params }) => {
        lookups += 1;
        return HttpResponse.json({
          station_id: Number(params.id),
          name: `Station ${params.id}`,
          type_id: 1529,
          system_id: 30000142,
        });
      }),
      http.get(`${ESI_BASE_URL}/universe/structures/:id`, ({ params }) => {
        lookups += 1;
        return HttpResponse.json({
          name: `Structure ${params.id}`,
          owner_id: 98,
          solar_system_id: 30003888,
          type_id: 35826,
        });
      }),
      systemHandler
    );

    const found = await searchBuildLocations(CHAR_ID, 'Common');

    expect(lookups).toBe(15);
    expect(found).toHaveLength(15);
    // Both categories survive the cap.
    expect(found.some((o) => o.facility === 'npcStation')).toBe(true);
    expect(found.some((o) => o.facility === 'azbel')).toBe(true);
  });

  it('passes the abort signal through, so a superseded query stops fetching', async () => {
    const controller = new AbortController();
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/search`, async () => {
        controller.abort();
        return HttpResponse.json({ structure: [AZBEL_ID] });
      }),
      structureHandler,
      systemHandler
    );

    await expect(searchBuildLocations(CHAR_ID, 'K2-18', controller.signal)).rejects.toThrow();
  });

  it('never calls ESI below the three-character floor ESI itself enforces', async () => {
    // No handler registered: onUnhandledRequest 'error' fails on any call.
    expect(await searchBuildLocations(CHAR_ID, 'K2')).toEqual([]);
    expect(await searchBuildLocations(CHAR_ID, '   ')).toEqual([]);
  });

  it('asks only for the two categories a job can run in', async () => {
    const seen = vi.fn<(url: URL) => void>();
    server.use(searchHandler({}, seen), systemHandler);

    await searchBuildLocations(CHAR_ID, 'K2-18');

    const url = seen.mock.calls[0]?.[0];
    expect(url?.searchParams.get('categories')).toBe('station,structure');
    expect(url?.searchParams.get('search')).toBe('K2-18');
  });
});
