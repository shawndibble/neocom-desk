import { describe, it, expect } from 'vitest';
import type { CorpAssetInput } from './assetDivisions';
import {
  buildItemLedger,
  buildLocationLedger,
  classifyCorpAssets,
  countLedgerByState,
  evaluateStockTargets,
} from './assetLedger';

const STATION = 60003760;
const OFFICE = 9000;

const a = (
  overrides: Partial<CorpAssetInput> & Pick<CorpAssetInput, 'itemId'>
): CorpAssetInput => ({
  typeId: 100,
  quantity: 1,
  locationId: OFFICE,
  locationType: 'item',
  locationFlag: 'CorpSAG1',
  ...overrides,
});

const office: CorpAssetInput = {
  itemId: OFFICE,
  typeId: 27,
  quantity: 1,
  locationId: STATION,
  locationType: 'station',
  locationFlag: 'OfficeFolder',
};

const prices = new Map([
  [100, 10],
  [200, 1000],
]);

describe('classifyCorpAssets', () => {
  it('puts a division item in Offices with its division and the office station', () => {
    const { items } = classifyCorpAssets([office, a({ itemId: 1, locationFlag: 'CorpSAG3' })]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      state: 'offices',
      division: 3,
      locationId: STATION,
      path: [],
    });
  });

  it('never lists OfficeFolder assets as items but reports their station', () => {
    const { items, officeLocationIds } = classifyCorpAssets([office]);
    expect(items).toEqual([]);
    expect([...officeLocationIds]).toEqual([STATION]);
  });

  it('inherits the root placement through nested containers and records the path', () => {
    const { items } = classifyCorpAssets([
      office,
      a({ itemId: 1, typeId: 300, locationFlag: 'CorpSAG2' }),
      a({ itemId: 2, typeId: 301, locationId: 1, locationFlag: 'Unlocked' }),
      a({ itemId: 3, typeId: 100, locationId: 2, locationFlag: 'Unlocked' }),
    ]);
    const leaf = items.find((i) => i.input.itemId === 3);
    expect(leaf).toMatchObject({ state: 'offices', division: 2, locationId: STATION });
    expect(leaf?.path).toEqual([
      { itemId: 1, typeId: 300 },
      { itemId: 2, typeId: 301 },
    ]);
  });

  it.each([
    ['CorpDeliveries', 'deliveries'],
    ['Impounded', 'impounded'],
    ['AssetSafety', 'assetSafety'],
    ['Locked', 'lockdown'],
    ['Deliveries', 'capsuleerDeliveries'],
    ['StructureFuel', 'fuelBay'],
    ['ServiceSlot3', 'inSpace'],
    ['QuantumCoreRoom', 'inSpace'],
    ['StructureDeedBay', 'inSpace'],
    ['MoonMaterialBay', 'inSpace'],
    ['SomethingNew', 'other'],
  ])('classifies root flag %s as %s', (flag, state) => {
    const { items } = classifyCorpAssets([
      a({ itemId: 1, locationId: STATION, locationType: 'station', locationFlag: flag }),
    ]);
    expect(items[0]).toMatchObject({ state, division: null, locationId: STATION });
  });

  it('classifies a root in a solar system as In space', () => {
    const { items } = classifyCorpAssets([
      a({
        itemId: 1,
        locationId: 30000142,
        locationType: 'solar_system',
        locationFlag: 'Unlocked',
      }),
    ]);
    expect(items[0]).toMatchObject({ state: 'inSpace', locationId: 30000142 });
  });

  it('keeps CorpDeliveries inside an office at the office station', () => {
    const { items } = classifyCorpAssets([
      office,
      a({ itemId: 1, locationFlag: 'CorpDeliveries' }),
    ]);
    expect(items[0]).toMatchObject({ state: 'deliveries', locationId: STATION });
  });

  it('survives a container cycle without hanging, landing in other', () => {
    const { items } = classifyCorpAssets([
      a({ itemId: 1, locationId: 2, locationFlag: 'Unlocked' }),
      a({ itemId: 2, locationId: 1, locationFlag: 'Unlocked' }),
    ]);
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.state === 'other' && i.locationId === null)).toBe(true);
  });
});

describe('countLedgerByState', () => {
  it('counts stacks (not units) per state plus all', () => {
    const { items } = classifyCorpAssets([
      office,
      a({ itemId: 1, quantity: 5 }),
      a({
        itemId: 2,
        quantity: 2,
        locationId: STATION,
        locationType: 'station',
        locationFlag: 'Impounded',
      }),
    ]);
    expect(countLedgerByState(items)).toMatchObject({
      all: 2,
      offices: 1,
      impounded: 1,
      lockdown: 0,
    });
  });
});

describe('buildItemLedger', () => {
  const classified = classifyCorpAssets([
    office,
    a({ itemId: 1, quantity: 4, isSingleton: false }),
    a({ itemId: 2, quantity: 6, locationFlag: 'CorpSAG2' }),
    a({ itemId: 3, typeId: 200, quantity: 1, isBlueprintCopy: true }),
    a({ itemId: 4, typeId: 200, quantity: 1 }),
    a({ itemId: 5, typeId: 300, locationFlag: 'CorpSAG1' }),
    a({ itemId: 6, typeId: 100, locationId: 5, locationFlag: 'Unlocked' }),
    a({
      itemId: 7,
      quantity: 3,
      locationId: STATION,
      locationType: 'station',
      locationFlag: 'Impounded',
    }),
  ]);
  const opts = {
    prices,
    copyValues: new Map([[3, 50]]),
    volumes: new Map([[100, 2]]),
  };

  it('makes one row per type and copy flag, valuing copies per item', () => {
    const rows = buildItemLedger(classified.items, opts);
    const type200 = rows.filter((r) => r.typeId === 200);
    expect(type200.map((r) => [r.isBlueprintCopy, r.estimatedValue])).toEqual(
      expect.arrayContaining([
        [true, 50],
        [false, 1000],
      ])
    );
    expect(type200).toHaveLength(2);
  });

  it('totals qty, value, volume and aggregates placements', () => {
    const row = buildItemLedger(classified.items, opts).find(
      (r) => r.typeId === 100 && !r.isBlueprintCopy
    )!;
    expect(row.quantity).toBe(14);
    expect(row.estimatedValue).toBe(140);
    expect(row.volume).toBe(28);
    expect(row.placements).toEqual(
      expect.arrayContaining([
        { state: 'offices', locationId: STATION, division: 1, quantity: 5, estimatedValue: 50 },
        { state: 'offices', locationId: STATION, division: 2, quantity: 6, estimatedValue: 60 },
        {
          state: 'impounded',
          locationId: STATION,
          division: null,
          quantity: 3,
          estimatedValue: 30,
        },
      ])
    );
    expect(row.placements).toHaveLength(3);
    const nested = row.stacks.find((s) => s.itemId === 6);
    expect(nested?.path).toEqual([{ itemId: 5, typeId: 300 }]);
    expect(row.stacks.find((s) => s.itemId === 1)?.isSingleton).toBe(false);
  });

  it('counts containers as items of their own type and leaves volume null without a map', () => {
    const rows = buildItemLedger(classified.items, { prices });
    expect(rows.find((r) => r.typeId === 300)?.quantity).toBe(1);
    expect(rows[0].volume).toBeNull();
  });

  it('filters by state, location and division', () => {
    const imp = buildItemLedger(classified.items, { ...opts, filter: { state: 'impounded' } });
    expect(imp.map((r) => r.typeId)).toEqual([100]);
    expect(imp[0].quantity).toBe(3);

    const div2 = buildItemLedger(classified.items, {
      ...opts,
      filter: { state: 'offices', locationId: STATION, division: 2 },
    });
    expect(div2).toHaveLength(1);
    expect(div2[0].quantity).toBe(6);

    expect(buildItemLedger(classified.items, { ...opts, filter: { locationId: 1 } })).toEqual([]);
  });

  it('puts unknown flags in other, visible under All only', () => {
    const c = classifyCorpAssets([
      a({ itemId: 1, locationId: STATION, locationType: 'station', locationFlag: 'Weird' }),
    ]);
    expect(buildItemLedger(c.items, { prices })).toHaveLength(1);
    expect(buildItemLedger(c.items, { prices, filter: { state: 'offices' } })).toEqual([]);
  });

  describe('stock targets', () => {
    const targets = new Map([
      [100, 20],
      [200, 1],
      [999, 5],
    ]);

    it('counts owned from offices + deliveries originals only', () => {
      const s = evaluateStockTargets(targets, classified.items);
      expect(s.get(100)).toEqual({ target: 20, owned: 11, shortBy: 9, status: 'short' });
      expect(s.get(200)).toEqual({ target: 1, owned: 1, shortBy: 0, status: 'met' });
      expect(s.get(999)).toEqual({ target: 5, owned: 0, shortBy: 5, status: 'none-owned' });
    });

    it('does not let a blueprint copy satisfy a target', () => {
      const c = classifyCorpAssets([office, a({ itemId: 3, typeId: 200, isBlueprintCopy: true })]);
      expect(evaluateStockTargets(new Map([[200, 1]]), c.items).get(200)?.status).toBe(
        'none-owned'
      );
    });

    it('counts Corp deliveries but not impounded', () => {
      const c = classifyCorpAssets([
        office,
        a({ itemId: 1, quantity: 2, locationFlag: 'CorpDeliveries' }),
        a({
          itemId: 2,
          quantity: 9,
          locationId: STATION,
          locationType: 'station',
          locationFlag: 'Impounded',
        }),
      ]);
      expect(evaluateStockTargets(new Map([[100, 3]]), c.items).get(100)?.owned).toBe(2);
    });

    it('treats a zero target as met', () => {
      expect(evaluateStockTargets(new Map([[999, 0]]), []).get(999)).toMatchObject({
        status: 'met',
        shortBy: 0,
      });
    });

    it('adds no qty-0 rows on the deliveries tab', () => {
      const rows = buildItemLedger(classified.items, {
        ...opts,
        targets,
        filter: { state: 'deliveries' },
      });
      expect(rows.find((r) => r.typeId === 999)).toBeUndefined();
    });

    it('adds qty-0 rows for targeted types nothing owns and attaches stock to rows', () => {
      const rows = buildItemLedger(classified.items, { ...opts, targets });
      const missing = rows.find((r) => r.typeId === 999)!;
      expect(missing).toMatchObject({ quantity: 0, estimatedValue: 0, placements: [], stacks: [] });
      expect(missing.stock?.status).toBe('none-owned');
      const bpc = rows.find((r) => r.typeId === 200 && r.isBlueprintCopy)!;
      expect(bpc.stock).toBeNull();
    });

    it('uses a stock evaluation the caller already made', () => {
      const stock = evaluateStockTargets(targets, classified.items);
      const rows = buildItemLedger(classified.items, { ...opts, targets, stock });
      expect(rows.find((r) => r.typeId === 999)?.stock).toBe(stock.get(999));
    });

    it('evaluates stock against everything, even when the rows are filtered', () => {
      const rows = buildItemLedger(classified.items, {
        ...opts,
        targets,
        filter: { state: 'impounded' },
      });
      expect(rows.find((r) => r.typeId === 100)?.stock?.owned).toBe(11);
      expect(rows.find((r) => r.typeId === 999)).toBeUndefined();
    });
  });
});

describe('buildLocationLedger', () => {
  const c = classifyCorpAssets([
    office,
    { ...office, itemId: 9001, locationId: 60000001 },
    a({ itemId: 1, quantity: 2, typeId: 100, locationFlag: 'CorpSAG1' }),
    a({ itemId: 2, typeId: 200, locationFlag: 'CorpSAG1' }),
    a({ itemId: 3, typeId: 100, locationFlag: 'CorpSAG1' }),
    a({ itemId: 4, typeId: 100, quantity: 40, locationFlag: 'CorpSAG1' }),
    a({ itemId: 5, quantity: 1, locationFlag: 'CorpDeliveries' }),
    a({ itemId: 6, locationId: STATION, locationType: 'station', locationFlag: 'AssetSafety' }),
  ]);

  it('gives every office all seven divisions plus deliveries, and flags empty offices', () => {
    const { offices } = buildLocationLedger(c, { prices, volumes: new Map([[100, 1]]) });
    expect(offices.map((o) => o.locationId)).toEqual([60000001, STATION]);
    const empty = offices[0];
    expect(empty.isEmpty).toBe(true);
    expect(empty.divisions.map((d) => d.division)).toEqual([1, 2, 3, 4, 5, 6, 7]);

    const main = offices[1];
    expect(main.isEmpty).toBe(false);
    const d1 = main.divisions[0];
    expect(d1.itemCount).toBe(4);
    expect(d1.estimatedValue).toBe(430 + 1000);
    expect(d1.volume).toBe(43);
    expect(d1.topStacks.map((s) => s.itemId)).toEqual([2, 4, 1]);
    expect(main.divisions[1].itemCount).toBe(0);
    expect(main.deliveries.itemCount).toBe(1);
  });

  it('sends locations without an OfficeFolder to others with their state', () => {
    const ledger = buildLocationLedger(
      classifyCorpAssets([
        a({
          itemId: 1,
          locationId: STATION,
          locationType: 'station',
          locationFlag: 'CorpDeliveries',
        }),
        a({ itemId: 2, locationId: 777, locationType: 'item', locationFlag: 'CorpSAG1' }),
      ]),
      { prices }
    );
    expect(ledger.offices).toEqual([]);
    expect(ledger.others.map((g) => g.state)).toEqual(['offices', 'deliveries']);
  });

  it('treats an office with only deliveries as empty and groups other states', () => {
    const only = classifyCorpAssets([office, a({ itemId: 5, locationFlag: 'CorpDeliveries' })]);
    expect(buildLocationLedger(only, { prices }).offices[0].isEmpty).toBe(true);
    const { others } = buildLocationLedger(c, { prices });
    expect(others).toHaveLength(1);
    expect(others[0]).toMatchObject({ state: 'assetSafety', locationId: STATION, itemCount: 1 });
  });
});
