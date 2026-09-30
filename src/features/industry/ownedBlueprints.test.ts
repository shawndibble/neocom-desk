import { describe, expect, it } from 'vitest';
import type { CharacterAsset, CharacterBlueprint } from '@/esi/endpoints';
import type { BlueprintCatalog, BlueprintCatalogEntry } from './blueprintCatalog';
import {
  blueprintKind,
  buildOwnedBlueprintRows,
  filterOwnedBlueprints,
  ownedBlueprintQuantity,
  resolveBlueprintPlacement,
  summarizeOwnedBlueprints,
  type OwnedBlueprintRow,
} from './ownedBlueprints';

function bp(overrides: Partial<CharacterBlueprint> = {}): CharacterBlueprint {
  return {
    item_id: 1,
    type_id: 100,
    runs: -1,
    material_efficiency: 10,
    time_efficiency: 20,
    quantity: -1,
    location_id: 60003760,
    location_flag: 'Hangar',
    ...overrides,
  };
}

function entry(
  blueprintTypeID: number,
  productName: string,
  activity: 'manufacturing' | 'reaction'
): BlueprintCatalogEntry {
  return {
    blueprintTypeID,
    blueprint: { activity },
    productTypeID: blueprintTypeID + 1,
    productName,
    productNameLower: productName.toLowerCase(),
  } as unknown as BlueprintCatalogEntry;
}

const catalog = {
  byBlueprintTypeID: new Map([
    [100, entry(100, 'Rifter', 'manufacturing')],
    [200, entry(200, 'Fullerides', 'reaction')],
  ]),
  typesById: {
    '100': { name: 'Rifter Blueprint' },
    '200': { name: 'Fullerides Reaction Formula' },
  },
} as unknown as BlueprintCatalog;

describe('blueprintKind', () => {
  it('reads runs -1 as a BPO and anything else as a BPC', () => {
    expect(blueprintKind(bp({ runs: -1 }))).toBe('bpo');
    expect(blueprintKind(bp({ runs: 5, quantity: -2 }))).toBe('bpc');
    expect(blueprintKind(bp({ runs: -2, quantity: -2 }))).toBe('bpc');
  });
});

describe('ownedBlueprintQuantity', () => {
  it('counts a singleton as one and a stack as its size', () => {
    expect(ownedBlueprintQuantity(bp({ quantity: -1 }))).toBe(1);
    expect(ownedBlueprintQuantity(bp({ quantity: -2 }))).toBe(1);
    expect(ownedBlueprintQuantity(bp({ quantity: 4 }))).toBe(4);
  });
});

describe('buildOwnedBlueprintRows', () => {
  const rows = buildOwnedBlueprintRows({
    ownedByCharacter: new Map([
      [
        1,
        [
          bp({ item_id: 11, type_id: 100 }),
          bp({ item_id: 12, type_id: 200, runs: 20, quantity: -2 }),
          bp({ item_id: 13, type_id: 999, runs: 3, quantity: -2 }),
        ],
      ],
    ]),
    characterNames: new Map([[1, 'Pilot One']]),
    corpBlueprints: [bp({ item_id: 21, type_id: 100 })],
    catalog,
    iskPerHourById: new Map([['1:11', 1_000_000]]),
  });

  it('keeps every blueprint, including reactions and ones the catalog does not know', () => {
    expect(rows.map((r) => r.id)).toEqual(['1:11', '1:12', '1:13', 'corp:21']);
  });

  it('names, classifies and owns each row', () => {
    const [rifter, reaction, unknown, corp] = rows as [
      OwnedBlueprintRow,
      OwnedBlueprintRow,
      OwnedBlueprintRow,
      OwnedBlueprintRow,
    ];
    expect(rifter).toMatchObject({
      name: 'Rifter Blueprint',
      kind: 'bpo',
      activity: 'manufacturing',
      owner: { kind: 'character', characterId: 1, name: 'Pilot One' },
      iskPerHour: 1_000_000,
    });
    expect(reaction).toMatchObject({ kind: 'bpc', activity: 'reaction', iskPerHour: null });
    expect(unknown).toMatchObject({ name: '#999', activity: null, catalogEntry: null });
    expect(corp.owner).toEqual({ kind: 'corporation' });
  });
});

describe('filterOwnedBlueprints', () => {
  const rows = buildOwnedBlueprintRows({
    ownedByCharacter: new Map([
      [
        1,
        [
          bp({ item_id: 11, type_id: 100 }),
          bp({ item_id: 12, type_id: 200, runs: 20, quantity: -2 }),
          bp({ item_id: 13, type_id: 999, runs: 3, quantity: -2 }),
        ],
      ],
    ]),
    characterNames: new Map([[1, 'Pilot One']]),
    corpBlueprints: [],
    catalog,
    iskPerHourById: new Map(),
  });
  const all = { kind: 'all', activity: 'all', search: '' } as const;
  const ids = (filtered: readonly OwnedBlueprintRow[]) => filtered.map((r) => r.id);

  it('passes everything through with no criteria', () => {
    expect(ids(filterOwnedBlueprints(rows, all))).toEqual(['1:11', '1:12', '1:13']);
  });

  it('filters by BPO/BPC', () => {
    expect(ids(filterOwnedBlueprints(rows, { ...all, kind: 'bpo' }))).toEqual(['1:11']);
    expect(ids(filterOwnedBlueprints(rows, { ...all, kind: 'bpc' }))).toEqual(['1:12', '1:13']);
  });

  it('filters by activity, dropping rows with no known activity', () => {
    expect(ids(filterOwnedBlueprints(rows, { ...all, activity: 'manufacturing' }))).toEqual([
      '1:11',
    ]);
    expect(ids(filterOwnedBlueprints(rows, { ...all, activity: 'reaction' }))).toEqual(['1:12']);
  });

  it('searches the blueprint and product names, case-insensitively', () => {
    expect(ids(filterOwnedBlueprints(rows, { ...all, search: '  rifter ' }))).toEqual(['1:11']);
    expect(ids(filterOwnedBlueprints(rows, { ...all, search: 'FORMULA' }))).toEqual(['1:12']);
  });
});

describe('summarizeOwnedBlueprints', () => {
  it('counts BPOs and BPCs, with a BPO stack counting as its size', () => {
    const rows = buildOwnedBlueprintRows({
      ownedByCharacter: new Map([
        [
          1,
          [
            bp({ item_id: 11, quantity: 3 }),
            bp({ item_id: 12 }),
            bp({ item_id: 13, runs: 2, quantity: -2 }),
          ],
        ],
      ]),
      characterNames: new Map(),
      corpBlueprints: [],
      catalog,
      iskPerHourById: new Map(),
    });
    expect(summarizeOwnedBlueprints(rows)).toEqual({ bpo: 4, bpc: 1 });
  });
});

describe('resolveBlueprintPlacement', () => {
  function asset(
    item_id: number,
    location_id: number,
    location_type: CharacterAsset['location_type']
  ): CharacterAsset {
    return {
      item_id,
      type_id: 3,
      quantity: 1,
      location_id,
      location_type,
      location_flag: 'Hangar',
      is_singleton: true,
    };
  }
  const assets = new Map<number, CharacterAsset>([
    [5000, asset(5000, 60003760, 'station')],
    [5001, asset(5001, 5000, 'item')],
    [6000, asset(6000, 6001, 'item')],
    [6001, asset(6001, 6000, 'item')],
  ]);

  it('uses a hangar location directly', () => {
    expect(resolveBlueprintPlacement(bp({ location_id: 60003760 }), assets)).toEqual({
      kind: 'place',
      locationId: 60003760,
    });
  });

  it('walks a container chain up to its station', () => {
    expect(
      resolveBlueprintPlacement(bp({ location_id: 5001, location_flag: 'AutoFit' }), assets)
    ).toEqual({ kind: 'place', locationId: 60003760 });
  });

  it('falls back to "in container" for an unknown container or a cyclic chain', () => {
    expect(
      resolveBlueprintPlacement(bp({ location_id: 7777, location_flag: 'Unlocked' }), assets)
    ).toEqual({ kind: 'container' });
    expect(
      resolveBlueprintPlacement(bp({ location_id: 6000, location_flag: 'AutoFit' }), assets)
    ).toEqual({ kind: 'container' });
  });

  it('treats a corp office division or ship bay it cannot follow as a container', () => {
    expect(
      resolveBlueprintPlacement(bp({ location_id: 8888, location_flag: 'CorpSAG1' }), assets)
    ).toEqual({ kind: 'container' });
    expect(
      resolveBlueprintPlacement(bp({ location_id: 8888, location_flag: 'FleetHangar' }), assets)
    ).toEqual({ kind: 'container' });
  });
});
