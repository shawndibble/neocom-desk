import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolvePlaceSystemId } from './placeSystem';

const loadStationSystemId = vi.fn();
const loadStructureSystemId = vi.fn();
vi.mock('@/features/character/stations', () => ({
  loadStationSystemId: (id: number) => loadStationSystemId(id),
}));
vi.mock('@/features/character/structures', () => ({
  loadStructureSystemId: (c: number, id: number) => loadStructureSystemId(c, id),
}));

describe('resolvePlaceSystemId', () => {
  beforeEach(() => {
    loadStationSystemId.mockReset();
    loadStructureSystemId.mockReset();
  });

  it('returns a solar system id as it is', async () => {
    expect(await resolvePlaceSystemId(30000142, 1)).toBe(30000142);
    expect(loadStationSystemId).not.toHaveBeenCalled();
  });

  it('maps an NPC station to its system', async () => {
    loadStationSystemId.mockResolvedValue(30000142);
    expect(await resolvePlaceSystemId(60003760, 1)).toBe(30000142);
  });

  it('maps a player structure through the active Character', async () => {
    loadStructureSystemId.mockResolvedValue(30002187);
    expect(await resolvePlaceSystemId(1_030_000_000_000, 7)).toBe(30002187);
    expect(loadStructureSystemId).toHaveBeenCalledWith(7, 1_030_000_000_000);
  });

  it('is null for a structure with no Character, and for an id that is no place', async () => {
    expect(await resolvePlaceSystemId(1_030_000_000_000, null)).toBeNull();
    expect(await resolvePlaceSystemId(12345, 1)).toBeNull();
  });
});
