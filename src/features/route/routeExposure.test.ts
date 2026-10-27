import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SolarSystemEntry } from '@/sde/marketTypes';

const findLocalRoute = vi.fn();
const loadSolarSystemsById = vi.fn();

vi.mock('@/features/route/localRoute', () => ({
  findLocalRoute: (...args: unknown[]) => findLocalRoute(...args),
}));
vi.mock('@/sde/solarSystems', () => ({
  loadSolarSystemsById: () => loadSolarSystemsById(),
}));

import { routeExposure } from './routeExposure';

const JITA = 30000142;
const PERIMETER = 30000144;
/** Uedama — a named gank chokepoint, and 0.5. */
const UEDAMA = 30002768;
const AMARR = 30002187;
/** Not in the snapshot at all. */
const MISSING = 39999999;

const SYSTEMS = new Map<number, SolarSystemEntry>(
  [
    { id: JITA, name: 'Jita', security: 0.9459, regionId: 1 },
    { id: PERIMETER, name: 'Perimeter', security: 0.9072, regionId: 1 },
    { id: UEDAMA, name: 'Uedama', security: 0.4977, regionId: 2 },
    { id: AMARR, name: 'Amarr', security: 1, regionId: 3 },
  ].map((entry) => [entry.id, entry])
);

beforeEach(() => {
  findLocalRoute.mockReset();
  loadSolarSystemsById.mockResolvedValue(SYSTEMS);
});

describe('routeExposure', () => {
  it('lists every system on the route in flown order, both ends included', async () => {
    findLocalRoute.mockResolvedValue({ kind: 'route', systems: [JITA, PERIMETER, UEDAMA, AMARR] });

    const result = await routeExposure(JITA, AMARR, {});

    expect(result).toMatchObject({ kind: 'known', exposedSystems: 1, totalSystems: 4 });
    expect(result.kind === 'known' && result.path).toEqual([
      { systemId: JITA, name: 'Jita', security: 0.9459, chokepoint: false },
      { systemId: PERIMETER, name: 'Perimeter', security: 0.9072, chokepoint: false },
      { systemId: UEDAMA, name: 'Uedama', security: 0.4977, chokepoint: true },
      { systemId: AMARR, name: 'Amarr', security: 1, chokepoint: false },
    ]);
  });

  it('keeps a system the snapshot does not hold, with no name or security, rather than dropping it', async () => {
    findLocalRoute.mockResolvedValue({ kind: 'route', systems: [JITA, MISSING, AMARR] });

    const result = await routeExposure(JITA, AMARR, {});

    expect(result.kind === 'known' && result.path[1]).toEqual({
      systemId: MISSING,
      name: null,
      security: null,
      chokepoint: false,
    });
  });

  it('has no path where there is no gate route', async () => {
    findLocalRoute.mockResolvedValue({ kind: 'no-route' });

    expect(await routeExposure(JITA, AMARR, {})).toEqual({ kind: 'no-route' });
  });
});
