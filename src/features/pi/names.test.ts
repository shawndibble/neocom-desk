import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { mswServer } from '@/test/msw';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import { loadPi } from '@/sde/loadSde';
import { loadPlanetName, loadSchematicName, readCachedSchematicNames } from './names';

vi.mock('@/sde/loadSde', () => ({ loadPi: vi.fn() }));

const server = mswServer();

beforeEach(async () => {
  vi.mocked(loadPi).mockRejectedValue(new Error('no local data'));
  configureEsi({ getToken: vi.fn(async () => 'tok') });
  await db.esiCache.clear();
});
afterEach(() => {
  configureEsi({ getToken: null });
});

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

describe('loadSchematicName with bundled pi.json', () => {
  it('resolves from local data without any ESI call', async () => {
    vi.mocked(loadPi).mockResolvedValue({
      schematics: { '3645': { schematicId: 65, name: 'Water' } },
    } as unknown as Awaited<ReturnType<typeof loadPi>>);
    // No handler: onUnhandledRequest 'error' proves ESI was never reached.
    expect(await loadSchematicName(65)).toBe('Water');
    expect((await readCachedSchematicNames([65])).get(65)).toBe('Water');
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
