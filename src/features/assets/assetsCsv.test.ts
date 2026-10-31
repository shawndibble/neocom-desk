import { describe, it, expect } from 'vitest';
import { toCsv } from '@/lib/csv';
import type { CharacterAsset } from '@/esi/endpoints';
import { assetCsvRows, assetsCsvColumns, type AssetCsvContext } from './assetsCsv';

const t = (k: string, o?: Record<string, unknown>) => (o ? `${k}:${JSON.stringify(o)}` : k);

function asset(overrides: Partial<CharacterAsset> = {}): CharacterAsset {
  return {
    item_id: 1,
    type_id: 34,
    quantity: 10,
    location_id: 60003760,
    location_type: 'station',
    location_flag: 'Hangar',
    is_singleton: false,
    ...overrides,
  };
}

function context(assets: readonly CharacterAsset[], over: Partial<AssetCsvContext> = {}) {
  return {
    assetsByItemId: new Map(assets.map((a) => [a.item_id, a])),
    typeNames: new Map([
      [34, 'Tritanium'],
      [648, 'Badger'],
      [3293, 'Cargo Container'],
    ]),
    gameNames: {},
    locationNames: new Map([[60003760, 'Jita IV - Moon 4']]),
    systemNameByLocationId: new Map([[60003760, 'Jita']]),
    priceByTypeId: new Map([[34, 5]]),
    itemValueByItemId: new Map(),
    volumeByTypeId: new Map([[34, 0.01]]),
    blueprintTypeIds: null,
    t,
    ...over,
  } satisfies AssetCsvContext;
}

describe('assetCsvRows', () => {
  it('flattens groups into rows, preserving group and within-group order', () => {
    const a = asset({ item_id: 1 });
    const b = asset({ item_id: 2, type_id: 648, quantity: 1 });
    const rows = assetCsvRows(
      [
        { label: 'Jita IV - Moon 4', entries: [{ asset: a, name: 'Tritanium' }] },
        {
          label: 'Jita IV - Moon 4',
          nickname: 'Home market',
          entries: [{ asset: b, name: 'Badger', gameName: 'Hauler 1' }],
        },
      ],
      context([a, b])
    );
    expect(rows.map((r) => [r.name, r.nickname, r.gameName])).toEqual([
      ['Tritanium', '', ''],
      ['Badger', 'Home market', 'Hauler 1'],
    ]);
  });

  it('returns an empty array for no groups', () => {
    expect(assetCsvRows([], context([]))).toEqual([]);
  });

  it('gives the full path through containers and ships, with station and system', () => {
    const ship = asset({ item_id: 10, type_id: 648, quantity: 1, location_flag: 'Hangar' });
    const box = asset({
      item_id: 11,
      type_id: 3293,
      location_id: 10,
      location_type: 'item',
      location_flag: 'Cargo',
    });
    const ore = asset({
      item_id: 12,
      location_id: 11,
      location_type: 'item',
      location_flag: 'Unlocked',
    });
    const [row] = assetCsvRows(
      [{ label: 'Cargo Container', entries: [{ asset: ore, name: 'Tritanium' }] }],
      context([ship, box, ore], { gameNames: { 10: 'Hauler 1' } })
    );
    expect(row).toMatchObject({
      location: 'Cargo Container',
      locationPath: 'Jita IV - Moon 4 › Hauler 1 › Cargo Container',
      place: 'Jita IV - Moon 4',
      system: 'Jita',
      locationFlag: 'Unlocked',
      itemId: 12,
      typeId: 34,
    });
  });

  it('labels an item in space by its system, and a structure parent ESI never listed', () => {
    const inSpace = asset({ item_id: 2, location_id: 30000142, location_type: 'solar_system' });
    const inCitadel = asset({ item_id: 3, location_id: 1_000_000_000_001, location_type: 'item' });
    const rows = assetCsvRows(
      [
        {
          label: 'x',
          entries: [
            { asset: inSpace, name: 'Tritanium' },
            { asset: inCitadel, name: 'Tritanium' },
          ],
        },
      ],
      context([inSpace, inCitadel], {
        locationNames: new Map([[30000142, 'Jita']]),
        systemNameByLocationId: new Map([[1_000_000_000_001, 'Perimeter']]),
      })
    );
    expect(rows[0]).toMatchObject({ place: '', system: 'Jita' });
    expect(rows[1]).toMatchObject({
      locationPath: 'assets.structureLabel:{"id":1000000000001}',
      system: 'Perimeter',
    });
  });

  it('values the stack and its volume, and leaves unpriced and unknown figures blank', () => {
    const priced = asset({ item_id: 1 });
    const unpriced = asset({ item_id: 2, type_id: 999, quantity: 3 });
    const [a, b] = assetCsvRows(
      [
        {
          label: 'x',
          entries: [
            { asset: priced, name: 'Tritanium' },
            { asset: unpriced, name: 'Mystery' },
          ],
        },
      ],
      context([priced, unpriced])
    );
    expect(a).toMatchObject({
      unitPrice: 5,
      totalValue: 50,
      unitVolume: 0.01,
      totalVolume: 0.1,
    });
    expect(b).toMatchObject({
      unitPrice: null,
      totalValue: null,
      unitVolume: null,
      totalVolume: null,
    });
  });

  it('marks blueprint originals and copies, a copy valued by its own figure', () => {
    const bpo = asset({ item_id: 1, type_id: 700, quantity: 1, is_singleton: true });
    const bpc = asset({
      item_id: 2,
      type_id: 700,
      quantity: 1,
      is_singleton: true,
      is_blueprint_copy: true,
    });
    const rows = assetCsvRows(
      [
        {
          label: 'x',
          entries: [
            { asset: bpo, name: 'Rifter Blueprint' },
            { asset: bpc, name: 'Rifter Blueprint' },
          ],
        },
      ],
      context([bpo, bpc], {
        blueprintTypeIds: new Set([700]),
        priceByTypeId: new Map([[700, 1000]]),
        itemValueByItemId: new Map([[2, 250]]),
      })
    );
    expect(rows.map((r) => [r.blueprint, r.totalValue])).toEqual([
      ['BPO', 1000],
      ['BPC', 250],
    ]);
  });
});

describe('assetsCsvColumns', () => {
  it('orders the columns, existing four first in their old relative order', () => {
    expect(assetsCsvColumns(t).map((c) => c.header)).toEqual([
      'assets.csvLocation',
      'assets.csvLocationPath',
      'assets.csvPlace',
      'assets.csvSystem',
      'assets.csvItem',
      'assets.csvGameName',
      'assets.csvQuantity',
      'assets.csvNickname',
      'assets.csvUnitPrice',
      'assets.csvTotalValue',
      'assets.csvUnitVolume',
      'assets.csvTotalVolume',
      'assets.csvBlueprint',
      'assets.csvLocationFlag',
      'assets.csvItemId',
      'assets.csvTypeId',
    ]);
  });

  it('emits a raw number for quantity', () => {
    const a = asset({ quantity: 12345 });
    const rows = assetCsvRows(
      [{ label: 'Jita', entries: [{ asset: a, name: 'Tritanium' }] }],
      context([a])
    );
    const csv = toCsv(rows, assetsCsvColumns(t));
    expect(csv.split('\r\n')[1].split(',')[6]).toBe('12345');
  });
});
