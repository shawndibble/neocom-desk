import { describe, expect, it } from 'vitest';
import {
  FUEL_BLOCK_TYPE_IDS,
  STRONTIUM_TYPE_ID,
  TOWER_FUEL_PER_HOUR,
  fuelHoursLeft,
  summariseBay,
} from './starbases';

describe('summariseBay', () => {
  it('splits fuel blocks from strontium and ignores charters', () => {
    expect(
      summariseBay([
        { type_id: 4247, quantity: 300 },
        { type_id: 4051, quantity: 20 },
        { type_id: STRONTIUM_TYPE_ID, quantity: 400 },
        { type_id: 24592, quantity: 1 },
      ])
    ).toEqual({ fuelBlocks: 320, strontium: 400 });
  });

  it('reads a missing fuels list as an empty bay', () => {
    expect(summariseBay(undefined)).toEqual({ fuelBlocks: 0, strontium: 0 });
  });
});

describe('fuelHoursLeft', () => {
  it('divides the blocks by the tower type burn rate', () => {
    expect(fuelHoursLeft(12235, 400)).toBe(10);
    expect(fuelHoursLeft(20060, 100)).toBe(10);
  });

  it('is null for a tower type with no known rate, never zero', () => {
    expect(fuelHoursLeft(1, 400)).toBeNull();
  });

  it('is 0 for an empty bay of a known tower', () => {
    expect(fuelHoursLeft(12235, 0)).toBe(0);
  });
});

describe('the baked tables', () => {
  it('holds only positive whole rates and the four fuel block types', () => {
    for (const rate of TOWER_FUEL_PER_HOUR.values()) {
      expect(Number.isInteger(rate) && rate > 0).toBe(true);
    }
    expect([...FUEL_BLOCK_TYPE_IDS].sort()).toEqual([4051, 4246, 4247, 4312]);
  });
});
