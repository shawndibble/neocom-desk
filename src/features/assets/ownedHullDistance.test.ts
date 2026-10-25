import { describe, expect, it } from 'vitest';
import type { CharacterAsset } from '@/esi/endpoints';
import { nearestOwnedHulls, ownedHullCopies } from './ownedHullDistance';

const asset = (over: Partial<CharacterAsset>): CharacterAsset =>
  ({
    item_id: 1,
    type_id: 648,
    quantity: 1,
    location_id: 60000001,
    location_type: 'station',
    location_flag: 'Hangar',
    is_singleton: true,
    ...over,
  }) as CharacterAsset;

const HULLS = new Set([648, 649]);

describe('ownedHullCopies', () => {
  it('lists assembled hulls at a top-level place, with that place`s system', () => {
    const copies = ownedHullCopies(
      [{ characterId: 1, name: 'Alice', assets: [asset({}), asset({ item_id: 2, type_id: 34 })] }],
      HULLS
    );
    expect(copies).toEqual([
      {
        typeId: 648,
        characterId: 1,
        characterName: 'Alice',
        locationId: 60000001,
        locationType: 'station',
      },
    ]);
  });

  it('skips packaged hulls, hulls inside containers and hulls floating in space', () => {
    const copies = ownedHullCopies(
      [
        {
          characterId: 1,
          name: 'Alice',
          assets: [
            asset({ item_id: 1, is_singleton: false }),
            asset({ item_id: 2, location_type: 'item' }),
            asset({ item_id: 3, location_type: 'solar_system' }),
          ],
        },
      ],
      HULLS
    );
    expect(copies).toEqual([]);
  });
});

describe('nearestOwnedHulls', () => {
  const copy = (characterId: number, locationId: number, typeId = 648) => ({
    typeId,
    characterId,
    characterName: `C${characterId}`,
    locationId,
    locationType: 'station' as const,
  });
  const systems = new Map<number, number | null>([
    [10, 100],
    [20, 200],
    [30, null],
  ]);

  it('keeps the nearest copy and names the character it is nearest to', () => {
    const result = nearestOwnedHulls(
      [copy(1, 10), copy(2, 20)],
      systems,
      (characterId, systemId) => (characterId === 1 && systemId === 100 ? 5 : 2)
    );
    expect(result.get(648)).toEqual({ systemId: 200, jumps: 2, characterName: 'C2' });
  });

  it('prefers a known distance to an unknown one', () => {
    const result = nearestOwnedHulls([copy(1, 10), copy(1, 20)], systems, (_c, systemId) =>
      systemId === 100 ? null : 7
    );
    expect(result.get(648)).toEqual({ systemId: 200, jumps: 7, characterName: 'C1' });
  });

  it('reads unknown, never 0, when no distance is known', () => {
    const result = nearestOwnedHulls([copy(1, 10)], systems, () => null);
    expect(result.get(648)).toEqual({ systemId: 100, jumps: null, characterName: 'C1' });
  });

  it('ignores a copy whose system did not resolve, and a hull with none left', () => {
    const result = nearestOwnedHulls([copy(1, 30), copy(1, 99, 649)], systems, () => 1);
    expect(result.size).toBe(0);
  });

  it('keeps hulls apart', () => {
    const result = nearestOwnedHulls([copy(1, 10, 648), copy(1, 20, 649)], systems, () => 3);
    expect([...result.keys()].sort()).toEqual([648, 649]);
  });
});
