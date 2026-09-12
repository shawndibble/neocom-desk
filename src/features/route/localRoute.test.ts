import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadSolarSystemJumps = vi.fn();
const loadSolarSystems = vi.fn();

vi.mock('@/sde/loadMarketSde', () => ({
  loadSolarSystemJumps: () => loadSolarSystemJumps(),
  loadSolarSystems: () => loadSolarSystems(),
}));

import { findLocalJumps, findLocalRoute } from './localRoute';
import { clearJumpGraphIndex } from '@/sde/jumpGraph';
import { clearSolarSystemIndex } from '@/sde/solarSystems';

const HUB = 30000001;
const LOW = 30000002;
const FAR = 30000003;
const A = 30000004;
const B = 30000005;
const C = 30000006;
/** J-space: no stargates, so it is simply absent from the graph. */
const WORMHOLE = 31000042;

const JUMPS = {
  [HUB]: [LOW, A],
  [LOW]: [HUB, FAR],
  [FAR]: [LOW, C],
  [A]: [HUB, B],
  [B]: [A, C],
  [C]: [B, FAR],
  [WORMHOLE]: [],
};

const SYSTEMS = [
  { id: HUB, name: 'Hub', security: 1.0, regionId: 10000001 },
  { id: LOW, name: 'Lowpoint', security: 0.2, regionId: 10000001 },
  { id: FAR, name: 'Far', security: 0.9, regionId: 10000001 },
  { id: A, name: 'Aye', security: 0.8, regionId: 10000001 },
  { id: B, name: 'Bee', security: 0.7, regionId: 10000001 },
  { id: C, name: 'Cee', security: 0.9, regionId: 10000001 },
];

beforeEach(() => {
  clearJumpGraphIndex();
  clearSolarSystemIndex();
  loadSolarSystemJumps.mockReset();
  loadSolarSystems.mockReset();
  loadSolarSystemJumps.mockResolvedValue(JUMPS);
  loadSolarSystems.mockResolvedValue(SYSTEMS);
});

describe('findLocalRoute', () => {
  it('resolves a route with no ESI request at all', async () => {
    await expect(findLocalRoute(HUB, FAR, 'shortest')).resolves.toEqual({
      kind: 'route',
      systems: [HUB, LOW, FAR],
    });
  });

  it('reads the security snapshot, so prefer-highsec takes the long way round', async () => {
    await expect(findLocalRoute(HUB, FAR, 'prefer-highsec')).resolves.toEqual({
      kind: 'route',
      systems: [HUB, A, B, C, FAR],
    });
  });

  it('says no-route for a wormhole destination — a fact, not a gap', async () => {
    await expect(findLocalRoute(HUB, WORMHOLE, 'shortest')).resolves.toEqual({ kind: 'no-route' });
  });

  it('says unknown, not no-route, when the graph snapshot cannot be read', async () => {
    loadSolarSystemJumps.mockRejectedValue(new Error('offline'));
    await expect(findLocalRoute(HUB, FAR, 'shortest')).resolves.toEqual({ kind: 'unknown' });
  });

  it('still routes when only the systems snapshot is unreadable, degrading to shortest', async () => {
    loadSolarSystems.mockRejectedValue(new Error('offline'));
    // No security to bias on, so prefer-highsec must not pretend to — it
    // takes the short lowsec hop rather than answering unknown.
    await expect(findLocalRoute(HUB, FAR, 'prefer-highsec')).resolves.toEqual({
      kind: 'route',
      systems: [HUB, LOW, FAR],
    });
  });

  it('indexes the snapshots once across repeated lookups', async () => {
    await findLocalRoute(HUB, FAR);
    await findLocalRoute(FAR, HUB);
    await findLocalRoute(HUB, C);
    expect(loadSolarSystemJumps).toHaveBeenCalledTimes(1);
    expect(loadSolarSystems).toHaveBeenCalledTimes(1);
  });

  it('defaults to the shortest route when no preference is given', async () => {
    await expect(findLocalRoute(HUB, FAR)).resolves.toEqual({
      kind: 'route',
      systems: [HUB, LOW, FAR],
    });
  });
});

describe('findLocalJumps', () => {
  it('counts the jumps between the two ends', async () => {
    await expect(findLocalJumps(HUB, FAR, 'shortest')).resolves.toEqual({
      kind: 'known',
      jumps: 2,
    });
  });

  it('counts a same-system haul as zero jumps, not as unknown', async () => {
    await expect(findLocalJumps(HUB, HUB)).resolves.toEqual({ kind: 'known', jumps: 0 });
  });

  it('reports no distance for an unreachable destination', async () => {
    await expect(findLocalJumps(HUB, WORMHOLE)).resolves.toEqual({
      kind: 'unknown',
      reason: 'noRoute',
    });
  });

  it('reports no distance when the graph snapshot cannot be read', async () => {
    loadSolarSystemJumps.mockRejectedValue(new Error('offline'));
    await expect(findLocalJumps(HUB, FAR)).resolves.toEqual({
      kind: 'unknown',
      reason: 'noRoute',
    });
  });
});
