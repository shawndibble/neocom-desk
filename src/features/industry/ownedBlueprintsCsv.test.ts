import { describe, expect, it } from 'vitest';
import type { OwnedBlueprintRow } from './ownedBlueprints';
import { ownedBlueprintsCsvColumns } from './ownedBlueprintsCsv';

const t = (k: string) => k;

function row(overrides: Partial<OwnedBlueprintRow> = {}): OwnedBlueprintRow {
  return {
    id: '1:11',
    owner: { kind: 'character', characterId: 1, name: 'Pilot One' },
    blueprint: {
      item_id: 11,
      type_id: 100,
      runs: -1,
      material_efficiency: 10,
      time_efficiency: 20,
      quantity: 3,
      location_id: 60003760,
      location_flag: 'Hangar',
    },
    name: 'Rifter Blueprint',
    kind: 'bpo',
    activity: 'manufacturing',
    catalogEntry: { productName: 'Rifter' } as OwnedBlueprintRow['catalogEntry'],
    iskPerHour: 1_000_000,
    ...overrides,
  };
}

describe('ownedBlueprintsCsvColumns', () => {
  const columns = ownedBlueprintsCsvColumns(t, (r) => (r.id === '1:11' ? 'Jita IV - 4' : null));
  const values = (r: OwnedBlueprintRow) => columns.map((c) => c.value(r));

  it('orders columns as the table does', () => {
    expect(columns.map((c) => c.header)).toEqual([
      'industry.ownedBlueprintsBlueprint',
      'industry.product',
      'industry.ownedBlueprintsActivityLabel',
      'industry.opportunitiesBlueprint',
      'industry.ownedBlueprintsMe',
      'industry.ownedBlueprintsTe',
      'industry.runs',
      'industry.quantity',
      'industry.ownedBlueprintsLocation',
      'industry.ownedBlueprintsOwner',
      'industry.iskPerHour',
    ]);
  });

  it('exports a BPO with blank runs and its stack size', () => {
    expect(values(row())).toEqual([
      'Rifter Blueprint',
      'Rifter',
      'industry.ownedBlueprintsActivity.manufacturing',
      'industry.bpo',
      10,
      20,
      null,
      3,
      'Jita IV - 4',
      'Pilot One',
      1_000_000,
    ]);
  });

  it('exports a corp BPC with no catalog entry, location or ISK/hour as blanks', () => {
    expect(
      values(
        row({
          id: 'corp:12',
          owner: { kind: 'corporation' },
          blueprint: { ...row().blueprint, runs: 7, quantity: -2 },
          kind: 'bpc',
          activity: null,
          catalogEntry: null,
          iskPerHour: null,
        })
      )
    ).toEqual([
      'Rifter Blueprint',
      null,
      null,
      'industry.bpc',
      10,
      20,
      7,
      1,
      null,
      'industry.ownedBlueprintsCorporation',
      null,
    ]);
  });
});
