import { describe, expect, it } from 'vitest';
import type { CharacterAsset } from '@/esi/endpoints';
import {
  fittedRigCounts,
  holdCapacityM3,
  pickerStacks,
  selectedPlanCharacters,
} from './movePlanInput';

const asset = (over: Partial<CharacterAsset>): CharacterAsset =>
  ({
    item_id: 1,
    type_id: 34,
    quantity: 10,
    location_id: 60003760,
    location_type: 'station',
    location_flag: 'Hangar',
    is_singleton: false,
    ...over,
  }) as CharacterAsset;

const entries = [
  {
    characterId: 1,
    name: 'Alice',
    assets: [
      asset({ item_id: 1, quantity: 10 }),
      asset({ item_id: 2, quantity: 5 }),
      asset({ item_id: 3, type_id: 587, quantity: 1, is_singleton: true }),
      asset({ item_id: 4, type_id: 35, is_singleton: true }),
      asset({ item_id: 5, location_type: 'item', location_id: 3 }),
    ],
  },
];

describe('pickerStacks', () => {
  it('merges loose stock per location and type, keeps assembled ships, drops the rest', () => {
    const stacks = pickerStacks(entries, new Set([587]));
    expect(stacks.map((s) => [s.typeId, s.quantity, s.ship])).toEqual([
      [34, 15, false],
      [587, 1, true],
    ]);
  });
});

describe('selectedPlanCharacters', () => {
  it('keeps only the selected stacks, with their original item ids', () => {
    const stacks = pickerStacks(entries, new Set([587]));
    const [loose] = stacks;
    const chars = selectedPlanCharacters(entries, new Set([587]), new Set([loose.key]));
    expect(chars).toHaveLength(1);
    expect(chars[0].assets.map((a) => a.itemId)).toEqual([1, 2]);
  });
  it('drops a Character with nothing selected', () => {
    expect(selectedPlanCharacters(entries, new Set(), new Set())).toEqual([]);
  });
});

describe('holdCapacityM3', () => {
  it('prefers the general hold, falls back to the sum', () => {
    expect(
      holdCapacityM3([
        { kind: 'general', capacityM3: 100 },
        { kind: 'ore', capacityM3: 50 },
      ] as never)
    ).toBe(100);
    expect(holdCapacityM3([{ kind: 'ice', capacityM3: 50 }] as never)).toBe(50);
    expect(holdCapacityM3([])).toBeNull();
  });
});

describe('fittedRigCounts', () => {
  it('counts the rigs fitted to each assembled ship, ignoring other fitted modules', () => {
    const fit = (item_id: number, location_id: number, location_flag: string): CharacterAsset => ({
      item_id,
      type_id: 1,
      quantity: 1,
      location_id,
      location_type: 'item',
      location_flag,
      is_singleton: false,
    });
    const counts = fittedRigCounts([
      {
        characterId: 1,
        name: 'Alice',
        assets: [
          fit(11, 100, 'RigSlot0'),
          fit(12, 100, 'RigSlot1'),
          fit(13, 100, 'HiSlot0'),
          fit(14, 200, 'LoSlot0'),
        ],
      },
    ]);
    expect(counts.get(100)).toBe(2);
    expect(counts.has(200)).toBe(false);
  });
});
