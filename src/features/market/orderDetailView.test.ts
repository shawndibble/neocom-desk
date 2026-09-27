import { describe, it, expect } from 'vitest';
import {
  assembleOrderDetailView,
  EMPTY_ORDER_DETAIL_CACHES,
  type OrderDetailCacheContents,
  type OrderDetailSnapshot,
} from './orderDetailView';
import { openOrderRow } from './__fixtures__/openOrderRow';
import type { UndercutRival } from '@/engine/market/undercut';
import type { CharacterSkills } from './openOrdersModel';
import { characterModifiers, NO_CHARACTER_MODIFIERS } from '@/engine/industry/characterModifiers';
import { orderFloor } from '@/engine/market/orderFloor';

const JITA_SYSTEM = 30000142;
const AMARR_SYSTEM = 30002187;
const PERIMETER_SYSTEM = 30000144;

const REGION_RIVAL: UndercutRival = {
  scope: 'region',
  price: 490,
  gapIsk: 10,
  gapPct: 2,
  volumeRemain: 50,
  locationId: 60000001,
  systemId: PERIMETER_SYSTEM,
  ordersBeatingMe: 1,
  unitsBeatingMe: 50,
};

const SNAPSHOT: OrderDetailSnapshot = {
  npcStations: new Map([[60003760, { name: 'Jita IV - Moon 4', systemId: JITA_SYSTEM }]]),
  stationsLoaded: true,
  stationPrices: new Map(),
  skillsByCharacter: new Map(),
};

function caches(overrides: Partial<OrderDetailCacheContents> = {}): OrderDetailCacheContents {
  return { ...EMPTY_ORDER_DETAIL_CACHES, ...overrides };
}

describe('assembleOrderDetailView', () => {
  describe('hub bids', () => {
    it('is undefined until the hub bids load', () => {
      const view = assembleOrderDetailView(openOrderRow(), SNAPSHOT, caches());
      expect(view.hubs).toBeUndefined();
      expect(view.hubsFailed).toBe(false);
    });

    it('lists every trade hub with its bid and the route from this order', () => {
      const view = assembleOrderDetailView(
        openOrderRow(),
        SNAPSHOT,
        caches({
          hubBids: new Map([[34, { jita: 5.1, amarr: 5.4, dodixie: null, rens: 4.9, hek: null }]]),
          jumps: new Map([[`${JITA_SYSTEM}:${AMARR_SYSTEM}`, { kind: 'known', jumps: 9 }]]),
        })
      );
      expect(view.hubs).toEqual([
        { hubId: 'jita', systemName: 'Jita', stationId: 60003760, buyMax: 5.1, jumps: undefined },
        {
          hubId: 'amarr',
          systemName: 'Amarr',
          stationId: 60008494,
          buyMax: 5.4,
          jumps: { kind: 'known', jumps: 9 },
        },
        {
          hubId: 'dodixie',
          systemName: 'Dodixie',
          stationId: 60011866,
          buyMax: null,
          jumps: undefined,
        },
        { hubId: 'rens', systemName: 'Rens', stationId: 60004588, buyMax: 4.9, jumps: undefined },
        { hubId: 'hek', systemName: 'Hek', stationId: 60005686, buyMax: null, jumps: undefined },
      ]);
    });

    it('leaves every distance blank when the order sits somewhere with no known system', () => {
      const view = assembleOrderDetailView(
        openOrderRow({ locationId: 1_000_000_000_001, stationName: null }),
        SNAPSHOT,
        caches({
          hubBids: new Map([[34, { jita: 5, amarr: 5, dodixie: 5, rens: 5, hek: 5 }]]),
          jumps: new Map([[`${JITA_SYSTEM}:${AMARR_SYSTEM}`, { kind: 'known', jumps: 9 }]]),
        })
      );
      expect(view.hubs?.map((hub) => hub.jumps)).toEqual([
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      ]);
    });

    it('says the hub lookup failed', () => {
      const view = assembleOrderDetailView(
        openOrderRow(),
        SNAPSHOT,
        caches({ hubBidsFailed: new Set([34]) })
      );
      expect(view.hubsFailed).toBe(true);
    });
  });

  describe('region jumps', () => {
    const rivalRow = openOrderRow({
      deepUndercut: { worst: REGION_RIVAL, byScope: { region: REGION_RIVAL } },
    });
    const routes = caches({
      jumps: new Map([[`${JITA_SYSTEM}:${PERIMETER_SYSTEM}`, { kind: 'known', jumps: 1 }]]),
    });

    it("is the route from this order's system to the region rival's", () => {
      expect(assembleOrderDetailView(rivalRow, SNAPSHOT, routes).regionJumps).toEqual({
        kind: 'known',
        jumps: 1,
      });
    });

    it('is undefined with no region rival yet', () => {
      expect(assembleOrderDetailView(openOrderRow(), SNAPSHOT, routes).regionJumps).toBeUndefined();
    });

    it("is undefined when this order's own system is unknown", () => {
      const snapshot = { ...SNAPSHOT, npcStations: new Map() };
      expect(assembleOrderDetailView(rivalRow, snapshot, routes).regionJumps).toBeUndefined();
    });
  });

  describe('refine comparison', () => {
    const SKILLS: CharacterSkills = {
      accountingLevel: 5,
      brokerRelationsLevel: 5,
      advancedBrokerRelationsLevel: 5,
      modifiers: characterModifiers({ skills: {}, implantTypeIds: [27174] }),
    };
    const ENTRY = { portionSize: 100, materials: [{ typeID: 34, quantity: 400 }] };
    const withSkills = { ...SNAPSHOT, skillsByCharacter: new Map([[1, SKILLS]]) };

    it("pairs this station's material prices with the order owner's modifiers", () => {
      const view = assembleOrderDetailView(
        openOrderRow({ typeId: 1230 }),
        withSkills,
        caches({
          refine: new Map([['60003760:1230', { entry: ENTRY, materialPrices: { 34: 4 } }]]),
        })
      );
      expect(view.reprocessing).toEqual({
        entry: ENTRY,
        materialPrices: { 34: 4 },
        modifiers: SKILLS.modifiers,
      });
    });

    it('ignores the same item priced at another station', () => {
      const view = assembleOrderDetailView(
        openOrderRow({ typeId: 1230 }),
        withSkills,
        caches({
          refine: new Map([['60008494:1230', { entry: ENTRY, materialPrices: { 34: 4 } }]]),
        })
      );
      expect(view.reprocessing).toBeUndefined();
    });

    it("is undefined when the order owner's skills did not load", () => {
      const view = assembleOrderDetailView(
        openOrderRow({ typeId: 1230 }),
        {
          ...SNAPSHOT,
          skillsByCharacter: new Map([[2, { ...SKILLS, modifiers: NO_CHARACTER_MODIFIERS }]]),
        },
        caches({
          refine: new Map([['60003760:1230', { entry: ENTRY, materialPrices: { 34: 4 } }]]),
        })
      );
      expect(view.reprocessing).toBeUndefined();
    });
  });

  describe('relist fees', () => {
    function flooredRow(skills: CharacterSkills, unitCost: number, remainingQuantity: number) {
      const floor = orderFloor({
        unitCost,
        remainingQuantity,
        accountingLevel: skills.accountingLevel,
        brokerRelationsLevel: skills.brokerRelationsLevel,
        advancedBrokerRelationsLevel: skills.advancedBrokerRelationsLevel,
      });
      if (!floor) throw new Error('expected a floor for this fixture');
      return openOrderRow({
        floor,
        volumeRemain: remainingQuantity,
        costBasis: { unitCost, runId: 'run-1', runQuantity: 8, materialCost: 2500, jobFee: 1000 },
      });
    }
    const snapshotWith = (skills: CharacterSkills) => ({
      ...SNAPSHOT,
      skillsByCharacter: new Map([[1, skills]]),
    });

    it("reads sales tax off the relist price at the owner's Accounting level", () => {
      const skills: CharacterSkills = {
        accountingLevel: 5,
        brokerRelationsLevel: 5,
        advancedBrokerRelationsLevel: 5,
        modifiers: NO_CHARACTER_MODIFIERS,
      };
      const row = openOrderRow({
        floor: { relist: 1000, fill: 900 },
        costBasis: {
          unitCost: 950,
          runId: 'run-1',
          runQuantity: 8,
          materialCost: 2500,
          jobFee: 1000,
        },
      });
      // 7.5% base, less 11% a level: 3.375% of 1,000 ISK.
      const fees = assembleOrderDetailView(row, snapshotWith(skills), caches()).relistFees;
      expect(fees?.salesTax).toBeCloseTo(33.75, 6);
      expect(fees?.brokerFee).toBeCloseTo(16.25, 6);
    });

    it('sums cost per unit, sales tax and broker fee to exactly the relist floor', () => {
      const skills: CharacterSkills = {
        accountingLevel: 3,
        brokerRelationsLevel: 2,
        advancedBrokerRelationsLevel: 1,
        modifiers: NO_CHARACTER_MODIFIERS,
      };
      const row = flooredRow(skills, 437.5, 1);
      const fees = assembleOrderDetailView(row, snapshotWith(skills), caches()).relistFees;
      expect(fees).not.toBeNull();
      expect(437.5 + fees!.salesTax + fees!.brokerFee).toBeCloseTo(row.floor!.relist, 6);
    });

    it('spreads the broker fee minimum across a large remaining quantity, not re-applied per unit', () => {
      // Regression pin for #1224: re-deriving the fee at quantity 1 would
      // re-apply its 100 ISK minimum to a single unit.
      const skills: CharacterSkills = {
        accountingLevel: 5,
        brokerRelationsLevel: 5,
        advancedBrokerRelationsLevel: 5,
        modifiers: NO_CHARACTER_MODIFIERS,
      };
      const row = flooredRow(skills, 10, 10_000);
      const fees = assembleOrderDetailView(row, snapshotWith(skills), caches()).relistFees;
      expect(fees!.brokerFee).toBeLessThan(5);
      expect(10 + fees!.salesTax + fees!.brokerFee).toBeCloseTo(row.floor!.relist, 6);
    });

    it("is null without the owner's skills or without a floor", () => {
      const skills: CharacterSkills = {
        accountingLevel: 5,
        brokerRelationsLevel: 5,
        advancedBrokerRelationsLevel: 5,
        modifiers: NO_CHARACTER_MODIFIERS,
      };
      const row = flooredRow(skills, 437.5, 1);
      expect(assembleOrderDetailView(row, SNAPSHOT, caches()).relistFees).toBeNull();
      expect(
        assembleOrderDetailView({ ...row, floor: null }, snapshotWith(skills), caches()).relistFees
      ).toBeNull();
    });
  });

  describe('loaded books', () => {
    const BOOK = { competitors: [], fetchedAt: 1, truncated: false };
    const HISTORY = { points: [], fetchedAt: 1 };

    it("reads the region book and price history for this order's region and item only", () => {
      const view = assembleOrderDetailView(
        openOrderRow(),
        SNAPSHOT,
        caches({
          regionBooks: new Map([['10000002:35', BOOK]]),
          history: new Map([['10000043:34', HISTORY]]),
        })
      );
      expect(view.deep).toBeNull();
      expect(view.history).toBeNull();

      const loaded = assembleOrderDetailView(
        openOrderRow(),
        SNAPSHOT,
        caches({
          regionBooks: new Map([['10000002:34', BOOK]]),
          history: new Map([['10000002:34', HISTORY]]),
        })
      );
      expect(loaded.deep).toBe(BOOK);
      expect(loaded.history).toBe(HISTORY);
    });

    it('says the region book is loading while it is in flight', () => {
      const view = assembleOrderDetailView(
        openOrderRow(),
        SNAPSHOT,
        caches({ regionBooksLoading: new Set(['10000002:34']) })
      );
      expect(view.loadingDeep).toBe(true);
    });

    it("reads this structure's own book", () => {
      const row = openOrderRow({ locationId: 1_000_000_000_001, stationName: null });
      const view = assembleOrderDetailView(
        row,
        SNAPSHOT,
        caches({ structureBooks: new Map([[1_000_000_000_001, BOOK]]) })
      );
      expect(view.structureMarket).toBe(BOOK);
      expect(
        assembleOrderDetailView(openOrderRow(), SNAPSHOT, caches()).structureMarket
      ).toBeNull();
    });

    it('knows whether the station tier priced this item here, and whether the station lookup loaded', () => {
      const snapshot: OrderDetailSnapshot = {
        ...SNAPSHOT,
        stationsLoaded: false,
        stationPrices: new Map([
          ['60003760:34', { buyMax: 4, sellMin: 5, buyVolume: 1, sellVolume: 1 }],
        ]),
      };
      const view = assembleOrderDetailView(openOrderRow(), snapshot, caches());
      expect(view.stationChecked).toBe(true);
      expect(view.stationsLoaded).toBe(false);
      expect(assembleOrderDetailView(openOrderRow(), SNAPSHOT, caches()).stationChecked).toBe(
        false
      );
    });

    it('names NPC stations and returns null for anything else', () => {
      const view = assembleOrderDetailView(openOrderRow(), SNAPSHOT, caches());
      expect(view.stationNameFor(60003760)).toBe('Jita IV - Moon 4');
      expect(view.stationNameFor(1_000_000_000_001)).toBeNull();
    });
  });
});
