import { describe, expect, it } from 'vitest';
import { WORMHOLE_SHIP_SIZES } from './theraConnections';
import { wormholeSizeForShipGroup } from './hullWormholeSize';

describe('wormholeSizeForShipGroup', () => {
  it.each([
    ['Frigate', 25, 'small'],
    ['Interceptor', 831, 'small'],
    ['Destroyer', 420, 'small'],
    ['Tactical Destroyer', 1305, 'small'],
    ['Cruiser', 26, 'medium'],
    ['Heavy Assault Cruiser', 358, 'medium'],
    ['Battlecruiser', 419, 'medium'],
    ['Command Ship', 540, 'medium'],
    ['Battleship', 27, 'large'],
    ['Marauder', 900, 'large'],
    ['Black Ops', 898, 'large'],
    ['Carrier', 547, 'capital'],
    ['Dreadnought', 485, 'capital'],
    ['Titan', 30, 'capital'],
    ['Freighter', 513, 'capital'],
    ['Jump Freighter', 902, 'capital'],
  ] as const)('maps %s (%i) to %s', (_name, groupId, size) => {
    expect(wormholeSizeForShipGroup(groupId)).toBe(size);
  });

  it('gives no size for a group it does not know, so nothing is prefilled', () => {
    expect(wormholeSizeForShipGroup(28)).toBeNull(); // Industrial: mass varies by hull
    expect(wormholeSizeForShipGroup(-1)).toBeNull();
  });

  it('only returns sizes the Route Safety control offers', () => {
    for (const id of [25, 26, 27, 547]) {
      expect(WORMHOLE_SHIP_SIZES).toContain(wormholeSizeForShipGroup(id));
    }
  });
});
