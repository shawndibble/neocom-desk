import { describe, it, expect } from 'vitest';
import type { ShipRow } from '@/engine/myShips';
import { shipsCsvColumns, type ShipsCsvLookups } from './shipsCsv';

const t = (k: string) => k;

const ship: ShipRow = {
  itemId: 11,
  typeId: 28606,
  characterId: 1,
  locationId: 60003760,
  locationType: 'station',
  inCargo: true,
  trail: [5],
  holderFlags: ['Cargo'],
  packaged: false,
  quantity: 1,
};

function lookups(over: Partial<ShipsCsvLookups> = {}): ShipsCsvLookups {
  return {
    shipName: () => 'Orca',
    gameName: () => 'Big Blue',
    shipClass: () => 'Industrial Command Ship',
    characterName: () => 'Rixx Javix',
    location: () => 'Jita IV - Moon 4',
    heldInside: () => 'Cargo Container',
    security: () => 0.9,
    jumps: () => 0,
    ...over,
  };
}

const valuesOf = (row: ShipRow, over: Partial<ShipsCsvLookups> = {}) =>
  Object.fromEntries(shipsCsvColumns(t, lookups(over)).map((c) => [c.header, c.value(row)]));

describe('shipsCsvColumns', () => {
  it('orders every column the tab shows, then the ids', () => {
    expect(shipsCsvColumns(t, lookups()).map((c) => c.header)).toEqual([
      'assets.myShips.columns.ship',
      'assets.csvGameName',
      'assets.myShips.csvClass',
      'assets.myShips.packaged',
      'assets.csvQuantity',
      'assets.myShips.columns.character',
      'assets.myShips.columns.location',
      'assets.myShips.csvHeldInside',
      'assets.myShips.columns.security',
      'assets.myShips.columns.jumps',
      'assets.csvItemId',
      'assets.csvTypeId',
      'assets.csvLocationId',
    ]);
  });

  it('exports numbers raw, keeping 0 jumps and leaving unread values blank', () => {
    expect(valuesOf(ship)).toMatchObject({
      'assets.myShips.columns.security': 0.9,
      'assets.myShips.columns.jumps': 0,
      'assets.csvQuantity': 1,
      'assets.myShips.packaged': 'common.exportFlagNo',
      'assets.csvItemId': 11,
    });
    expect(
      valuesOf({ ...ship, packaged: true }, { security: () => null, jumps: () => null })
    ).toMatchObject({
      'assets.myShips.columns.security': null,
      'assets.myShips.columns.jumps': null,
      'assets.myShips.packaged': 'common.exportFlagYes',
    });
  });
});
