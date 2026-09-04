import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import { loadPlanetName, loadSchematicName, readCachedSchematicNames } from './names';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(async () => {
  configureEsi({ getToken: vi.fn(async () => 'tok') });
  await db.esiCache.clear();
});
afterEach(() => {
  server.resetHandlers();
  configureEsi({ getToken: null });
});
afterAll(() => server.close());

describe('loadPlanetName', () => {
  it('resolves a planet name from the public endpoint', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/universe/planets/40000001`, () =>
        HttpResponse.json({
          planet_id: 40000001,
          name: 'Jita IV',
          system_id: 30000142,
          type_id: 11,
          position: { x: 0, y: 0, z: 0 },
        })
      )
    );
    expect(await loadPlanetName(40000001)).toBe('Jita IV');
  });

  it('returns null when unresolvable and uncached', async () => {
    server.use(http.get(`${ESI_BASE_URL}/universe/planets/40000002`, () => HttpResponse.error()));
    expect(await loadPlanetName(40000002)).toBeNull();
  });
});

describe('loadSchematicName', () => {
  it('resolves a schematic name from the public endpoint', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/universe/schematics/65`, () =>
        HttpResponse.json({ schematic_name: 'Water', cycle_time: 1800 })
      )
    );
    expect(await loadSchematicName(65)).toBe('Water');
  });
});

describe('readCachedSchematicNames', () => {
  it('reads a name a prior loadSchematicName call already cached, with no live call', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/universe/schematics/65`, () =>
        HttpResponse.json({ schematic_name: 'Water', cycle_time: 1800 })
      )
    );
    await loadSchematicName(65);

    // No handler for 66 at all: onUnhandledRequest 'error' means reaching
    // this line at all proves the miss below never fetched.
    const names = await readCachedSchematicNames([65, 66]);

    expect(names.get(65)).toBe('Water');
    expect(names.has(66)).toBe(false);
  });
});
