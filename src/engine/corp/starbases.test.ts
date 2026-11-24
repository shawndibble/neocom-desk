import { describe, expect, it } from 'vitest';
import {
  FUEL_BLOCK_TYPE_IDS,
  STRONTIUM_TYPE_ID,
  TOWER_FUEL_PER_HOUR,
  fuelHoursLeft,
  summariseBay,
  towerFuelExpiresMs,
  towerLabel,
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

describe('towerFuelExpiresMs', () => {
  const [typeId, perHour] = [...TOWER_FUEL_PER_HOUR][0];
  const bay = { fuelBlocks: perHour * 10, strontium: 0 };

  it('runs out the burn time after the bay was read', () => {
    expect(towerFuelExpiresMs({ typeId, state: 'online', bay }, 1_000)).toBe(
      1_000 + 10 * 3_600_000
    );
  });

  it('has no clock for an offline tower, an unread bay or an unknown tower type', () => {
    expect(towerFuelExpiresMs({ typeId, state: 'offline', bay }, 0)).toBeNull();
    expect(towerFuelExpiresMs({ typeId, state: 'online', bay: null }, 0)).toBeNull();
    expect(towerFuelExpiresMs({ typeId: 1, state: 'online', bay }, 0)).toBeNull();
  });
});

describe('towerLabel', () => {
  it('adds the system when known', () => {
    expect(towerLabel('Amarr Control Tower', 'Efa')).toBe('Amarr Control Tower (Efa)');
    expect(towerLabel('Amarr Control Tower', undefined)).toBe('Amarr Control Tower');
  });
});
