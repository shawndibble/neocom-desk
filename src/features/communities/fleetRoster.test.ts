import { beforeEach, describe, expect, it, vi } from 'vitest';

const universe = vi.hoisted(() => ({ postUniverseIds: vi.fn() }));
vi.mock('@/esi/endpoints/universe', () => universe);

import { resolveFleetRoster } from './fleetRoster';

beforeEach(() => vi.resetAllMocks());

describe('resolveFleetRoster', () => {
  it('uses ESI spelling, marks Members, keeps unresolved names as typed', async () => {
    universe.postUniverseIds.mockResolvedValue({
      characters: [
        { id: 7, name: 'Alice Alt' },
        { id: 8, name: 'Bob' },
      ],
    });
    const rows = await resolveFleetRoster(['alice alt', 'Bob', 'Ghost'], [{ uid: 'char:7' }]);
    expect(rows).toEqual([
      { pilotName: 'Alice Alt', characterId: 7, isMember: true, notFound: false },
      { pilotName: 'Bob', characterId: 8, isMember: false, notFound: false },
      { pilotName: 'Ghost', characterId: null, isMember: false, notFound: true },
    ]);
  });

  it('hands every name to one lookup, which does its own batching', async () => {
    universe.postUniverseIds.mockResolvedValue({});
    const names = Array.from({ length: 501 }, (_, i) => `P${i}`);
    const rows = await resolveFleetRoster(names, []);
    expect(universe.postUniverseIds).toHaveBeenCalledTimes(1);
    expect(universe.postUniverseIds.mock.calls[0][0]).toHaveLength(501);
    expect(rows).toHaveLength(501);
  });
});
