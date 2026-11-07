import { describe, expect, it } from 'vitest';
import { activeShipItems, isCapsuleGroup } from './activeShip';

const SHIP = 1_000_000_001;
const asset = (
  item_id: number,
  location_id: number,
  location_flag: string,
  location_type: 'station' | 'solar_system' | 'item' | 'other' = 'item'
) => ({ item_id, type_id: 100 + item_id, quantity: 1, location_id, location_type, location_flag });

describe('activeShipItems', () => {
  it('keeps only the assets sitting inside the flown ship', () => {
    const items = activeShipItems(
      [
        asset(1, SHIP, 'HiSlot0'),
        asset(2, SHIP, 'DroneBay'),
        // The ship itself, in a station hangar.
        asset(SHIP, 60003760, 'Hangar', 'station'),
        // Another ship's module.
        asset(3, 1_000_000_002, 'HiSlot0'),
      ],
      SHIP
    );
    expect(items).toEqual([
      { typeId: 101, quantity: 1, flag: 'HiSlot0', itemId: 1 },
      { typeId: 102, quantity: 1, flag: 'DroneBay', itemId: 2 },
    ]);
  });

  it('ignores a station or system whose id happens to match the ship', () => {
    expect(activeShipItems([asset(4, SHIP, 'Hangar', 'station')], SHIP)).toEqual([]);
  });

  it('is empty when the assets have not caught up with a new ship yet', () => {
    expect(activeShipItems([asset(1, 1_000_000_002, 'HiSlot0')], SHIP)).toEqual([]);
  });
});

describe('isCapsuleGroup', () => {
  it('is true only for the Capsule group', () => {
    expect(isCapsuleGroup(29)).toBe(true);
    expect(isCapsuleGroup(25)).toBe(false);
    expect(isCapsuleGroup(undefined)).toBe(false);
  });
});
