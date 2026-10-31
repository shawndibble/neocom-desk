import { describe, it, expect } from 'vitest';
import { shipsCsvColumns, type ShipCsvRow } from './shipsCsv';

const t = (k: string) => k;

function row(overrides: Partial<ShipCsvRow> = {}): ShipCsvRow {
  return {
    ship: 'Orca',
    gameName: 'Big Blue',
    shipClass: 'Industrial Command Ship',
    packaged: false,
    quantity: 1,
    character: 'Rixx Javix',
    location: 'Jita IV - Moon 4',
    heldInside: 'Cargo Container',
    security: 0.9,
    jumps: 0,
    itemId: 11,
    typeId: 28606,
    locationId: 60003760,
    ...overrides,
  };
}

const valuesOf = (r: ShipCsvRow) =>
  Object.fromEntries(shipsCsvColumns(t).map((c) => [c.header, c.value(r)]));

describe('shipsCsvColumns', () => {
  it('orders every column the tab shows, then the ids', () => {
    expect(shipsCsvColumns(t).map((c) => c.header)).toEqual([
      'assets.myShips.columns.ship',
      'assets.myShips.csvGameName',
      'assets.myShips.csvClass',
      'assets.myShips.packaged',
      'assets.myShips.csvQuantity',
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
    expect(valuesOf(row())).toMatchObject({
      'assets.myShips.columns.security': 0.9,
      'assets.myShips.columns.jumps': 0,
      'assets.myShips.csvQuantity': 1,
      'assets.myShips.packaged': 'common.exportFlagNo',
    });
    expect(valuesOf(row({ security: null, jumps: null, packaged: true }))).toMatchObject({
      'assets.myShips.columns.security': null,
      'assets.myShips.columns.jumps': null,
      'assets.myShips.packaged': 'common.exportFlagYes',
    });
  });
});
