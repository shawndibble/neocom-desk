import { describe, it, expect } from 'vitest';
import type { CharacterAsset } from '@/esi/endpoints';
import { rootPlaceRefs } from './assetSystemNames';

const asset = (over: Partial<CharacterAsset>): CharacterAsset => ({
  item_id: 1,
  type_id: 34,
  quantity: 1,
  location_id: 60003760,
  location_type: 'station',
  location_flag: 'Hangar',
  is_singleton: false,
  ...over,
});

describe('rootPlaceRefs', () => {
  const names = new Map([
    [60003760, 'Jita IV'],
    [1_000_000_000_001, 'Citadel'],
  ]);

  it('lists each resolved station or structure once, a structure with its holder', () => {
    const assets = [
      asset({ item_id: 1 }),
      asset({ item_id: 2 }),
      asset({ item_id: 3, location_id: 1_000_000_000_001, location_type: 'other' }),
      // A parent ESI never listed as an asset is a structure.
      asset({ item_id: 4, location_id: 1_000_000_000_001, location_type: 'item' }),
    ];
    expect(rootPlaceRefs(assets, names, () => 7)).toEqual([
      { locationId: 60003760, characterId: null, kind: 'station' },
      { locationId: 1_000_000_000_001, characterId: 7, kind: 'structure' },
    ]);
  });

  it('skips systems, held items and places whose name never resolved', () => {
    const assets = [
      asset({ item_id: 1, location_id: 30000142, location_type: 'solar_system' }),
      asset({ item_id: 2, location_id: 1, location_type: 'item' }),
      asset({ item_id: 3, location_id: 99, location_type: 'other' }),
    ];
    expect(rootPlaceRefs([...assets, asset({ item_id: 1 })], new Map(), () => null)).toEqual([]);
  });
});
