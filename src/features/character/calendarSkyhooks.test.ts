import { beforeEach, describe, expect, it, vi } from 'vitest';

const NOW = Date.parse('2026-10-23T12:00:00Z');
const HOUR = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();

const access = vi.hoisted(() => ({ value: null as unknown }));
const reads = vi.hoisted(() => ({
  list: vi.fn(),
  details: vi.fn(),
}));

vi.mock('@/features/corp/corpReadAccess', () => ({
  resolveCorpReadAccess: async () => access.value,
}));
vi.mock('@/features/corp/sovereignty', () => ({
  loadCorporationSkyhooks: reads.list,
  loadSkyhookDetails: reads.details,
}));
vi.mock('@/features/overview/widgets/data/spaceLookups', () => ({
  planetInfo: async () => new Map([[70, { systemId: 30000001, name: 'X-7OMU IV' }]]),
}));
vi.mock('@/sde/solarSystems', () => ({
  loadSolarSystemsById: async () => new Map([[30000001, { name: 'X-7OMU' }]]),
}));

import { loadSkyhookRaids } from './calendarSkyhooks';

const cached = <T>(data: T) => ({
  cached: { data, fetchedAt: new Date(NOW), fromCache: false },
  needsReauth: false,
});

beforeEach(() => {
  reads.list.mockReset();
  reads.details.mockReset();
});

describe('loadSkyhookRaids', () => {
  it('makes no corp read and is not readable without the capability', async () => {
    access.value = { corporationId: 9, can: () => false };
    const read = await loadSkyhookRaids(1, NOW);
    expect(read.sources).toBeUndefined();
    expect(reads.list).not.toHaveBeenCalled();
  });

  it('is not readable with no corp access at all', async () => {
    access.value = null;
    expect((await loadSkyhookRaids(1, NOW)).sources).toBeUndefined();
    expect(reads.list).not.toHaveBeenCalled();
  });

  it('turns a readable skyhook into a clock and a detail row', async () => {
    access.value = { corporationId: 9, can: (c: string) => c === 'canReadSkyhooks' };
    reads.list.mockResolvedValue(cached({ skyhooks: [{ id: 5, planet_id: 70 }] }));
    reads.details.mockResolvedValue(
      new Map([
        [
          5,
          cached({
            theft_vulnerability: { start: iso(NOW + 2 * HOUR), end: iso(NOW + 4 * HOUR) },
            reagents: [
              { type_id: 1, last_cycle: '', secured_stock: 800, unsecured_stock: 400 },
              { type_id: 2, last_cycle: '', secured_stock: 0, unsecured_stock: 100 },
            ],
          }),
        ],
      ])
    );
    const read = await loadSkyhookRaids(1, NOW);
    expect(read.sources).toEqual([
      { id: '5', subject: 'X-7OMU IV', detail: 'upcoming', deadlineMs: NOW + 2 * HOUR },
    ]);
    expect(read.raids[0]).toMatchObject({
      systemId: 30000001,
      systemName: 'X-7OMU',
      unsecuredUnits: 500,
      securedUnits: 800,
    });
  });

  it('is not readable, never empty, when every detail read failed', async () => {
    access.value = { corporationId: 9, can: () => true };
    reads.list.mockResolvedValue(cached({ skyhooks: [{ id: 5, planet_id: 70 }] }));
    reads.details.mockResolvedValue(new Map([[5, { cached: null, needsReauth: false }]]));
    expect((await loadSkyhookRaids(1, NOW)).sources).toBeUndefined();
  });
});
