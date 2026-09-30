import { describe, it, expect } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useOpenOrderDetail, useOrderDetail } from './useOrderDetail';
import { fakeOrderDetailLoaders, withOrderDetailLoaders } from './__fixtures__/orderDetailLoaders';
import type { OrderDetailLoaders } from './orderDetailLoaders';
import type { OrderDetailSnapshot } from './orderDetailView';
import type { OpenOrderRow } from './openOrdersModel';
import { openOrderRow } from './__fixtures__/openOrderRow';
import type { CharacterSkills } from './openOrdersModel';
import { NO_CHARACTER_MODIFIERS } from '@/engine/industry/characterModifiers';

const REGION = 10000002;
const JITA_STATION = 60003760;
const JITA_SYSTEM = 30000142;

const SKILLS: CharacterSkills = {
  accountingLevel: 5,
  brokerRelationsLevel: 5,
  advancedBrokerRelationsLevel: 5,
  modifiers: NO_CHARACTER_MODIFIERS,
};

/** Best buy / sell at a station, as the station-price loader returns it. */
function aggregate(buyMax: number | null) {
  return { buyMax, sellMin: null, buyVolume: 1, sellVolume: 0 };
}

const SNAPSHOT: OrderDetailSnapshot = {
  npcStations: new Map([[JITA_STATION, { name: 'Jita IV - Moon 4', systemId: JITA_SYSTEM }]]),
  stationsLoaded: true,
  stationPrices: new Map(),
  skillsByCharacter: new Map([[1, SKILLS]]),
};

/** The panel's one Order Detail plus the modal's view of one open order. */
function renderOpenDetail(
  loaders: OrderDetailLoaders,
  row: OpenOrderRow = openOrderRow(),
  snapshot: OrderDetailSnapshot = SNAPSHOT
) {
  return renderHook(
    (props: { row: OpenOrderRow; snapshot: OrderDetailSnapshot }) => {
      const detail = useOrderDetail();
      return { detail, ...useOpenOrderDetail(detail, props.row, props.snapshot) };
    },
    {
      initialProps: { row, snapshot },
      wrapper: ({ children }: { children: ReactNode }) => withOrderDetailLoaders(children, loaders),
    }
  );
}

describe('useOrderDetail', () => {
  describe('opening an order', () => {
    it('loads its region book and price history, and shows them once they land', async () => {
      const loaders = fakeOrderDetailLoaders();
      const book = { competitors: [], fetchedAt: 1, truncated: false };
      const history = { points: [], fetchedAt: 1 };
      loaders.regionCompetition.mockResolvedValue(book);
      loaders.priceHistory.mockResolvedValue(history);

      const { result } = renderOpenDetail(loaders);

      expect(loaders.regionCompetition).toHaveBeenCalledWith(REGION, 34);
      expect(loaders.priceHistory).toHaveBeenCalledWith(REGION, 34);
      await waitFor(() => expect(result.current.view.deep).toBe(book));
      expect(result.current.view.history).toBe(history);
    });
  });

  describe('the refine comparison', () => {
    const SCORDITE = 1228;
    const ENTRY = {
      portionSize: 100,
      materials: [
        { typeID: 34, quantity: 150 },
        { typeID: 35, quantity: 90 },
      ],
    };

    it("prices each material at the best buy order at this order's own station", async () => {
      const loaders = fakeOrderDetailLoaders();
      loaders.reprocessing.mockResolvedValue({ [String(SCORDITE)]: ENTRY });
      loaders.stationBestPrices.mockResolvedValue(
        new Map([
          [`${JITA_STATION}:34`, aggregate(4.2)],
          [`${JITA_STATION}:35`, aggregate(null)],
        ])
      );

      const { result } = renderOpenDetail(loaders, openOrderRow({ typeId: SCORDITE }));

      await waitFor(() => expect(result.current.view.reprocessing).toBeDefined());
      expect(loaders.stationBestPrices).toHaveBeenCalledWith([
        { stationId: JITA_STATION, typeIds: [34, 35] },
      ]);
      // A material nobody bids on here is left unpriced, not priced at zero.
      expect(result.current.view.reprocessing).toEqual({
        entry: ENTRY,
        materialPrices: { 34: 4.2 },
        modifiers: NO_CHARACTER_MODIFIERS,
      });
    });

    it('answers "refines into nothing" for an item with no reprocessing entry, without pricing anything', async () => {
      const loaders = fakeOrderDetailLoaders();

      const { result } = renderOpenDetail(loaders, openOrderRow({ typeId: SCORDITE }));

      await waitFor(() =>
        expect(result.current.view.reprocessing).toEqual({
          entry: { portionSize: 1, materials: [] },
          materialPrices: {},
          modifiers: NO_CHARACTER_MODIFIERS,
        })
      );
      // Any station-price call is the hub sweep for the item itself, never a material lookup.
      for (const [requests] of loaders.stationBestPrices.mock.calls) {
        expect(requests.every((request) => request.typeIds.includes(SCORDITE))).toBe(true);
      }
    });
  });

  describe('hub bids', () => {
    const HUB_STATIONS = [60003760, 60008494, 60011866, 60004588, 60005686];

    it("asks every trade hub's own station what it bids for the item, with the route to each", async () => {
      const loaders = fakeOrderDetailLoaders();
      loaders.stationBestPrices.mockResolvedValue(
        new Map([
          ['60008494:34', aggregate(5.5)],
          ['60004588:34', aggregate(null)],
        ])
      );
      loaders.jumpsBetween.mockImplementation(async (_from, to) =>
        to === 30002187 ? { kind: 'known', jumps: 9 } : { kind: 'unknown', reason: 'noRoute' }
      );

      const { result } = renderOpenDetail(loaders);

      expect(loaders.stationBestPrices).toHaveBeenCalledWith(
        HUB_STATIONS.map((stationId) => ({ stationId, typeIds: [34] }))
      );
      for (const hubSystem of [30000142, 30002187, 30002659, 30002510, 30002053]) {
        expect(loaders.jumpsBetween).toHaveBeenCalledWith(JITA_SYSTEM, hubSystem, []);
      }
      await waitFor(() =>
        expect(result.current.view.hubs?.find((hub) => hub.hubId === 'amarr')).toEqual({
          hubId: 'amarr',
          systemName: 'Amarr',
          stationId: 60008494,
          buyMax: 5.5,
          jumps: { kind: 'known', jumps: 9 },
        })
      );
      expect(result.current.view.hubs?.map((hub) => hub.buyMax)).toEqual([
        null,
        5.5,
        null,
        null,
        null,
      ]);
    });

    it('says the hub lookup failed', async () => {
      const loaders = fakeOrderDetailLoaders();
      loaders.stationBestPrices.mockRejectedValue(new Error('Fuzzwork down'));

      const { result } = renderOpenDetail(loaders);

      await waitFor(() => expect(result.current.view.hubsFailed).toBe(true));
      expect(result.current.view.hubs).toBeUndefined();
    });

    it('asks for no routes from a player structure, whose system is unknown', () => {
      const loaders = fakeOrderDetailLoaders();

      renderOpenDetail(loaders, openOrderRow({ locationId: 1_000_000_000_001, stationName: null }));

      expect(loaders.jumpsBetween).not.toHaveBeenCalled();
    });
  });

  describe('the region rival route', () => {
    it('loads once the region book turns up a rival, and shows it', async () => {
      const loaders = fakeOrderDetailLoaders();
      const PERIMETER = 30000144;
      loaders.jumpsBetween.mockImplementation(async (_from, to) =>
        to === PERIMETER ? { kind: 'known', jumps: 1 } : { kind: 'unknown', reason: 'noRoute' }
      );
      const { result, rerender } = renderOpenDetail(loaders);
      expect(loaders.jumpsBetween).not.toHaveBeenCalledWith(JITA_SYSTEM, PERIMETER);

      // The panel hands over a newer copy of the row once the region book
      // reclassifies it.
      const rival = {
        scope: 'region' as const,
        price: 490,
        gapIsk: 10,
        gapPct: 2,
        volumeRemain: 50,
        locationId: 60000001,
        systemId: PERIMETER,
        ordersBeatingMe: 1,
        unitsBeatingMe: 50,
      };
      rerender({
        row: openOrderRow({ deepUndercut: { worst: rival, byScope: { region: rival } } }),
        snapshot: SNAPSHOT,
      });

      expect(loaders.jumpsBetween).toHaveBeenCalledWith(JITA_SYSTEM, PERIMETER, []);
      await waitFor(() =>
        expect(result.current.view.regionJumps).toEqual({ kind: 'known', jumps: 1 })
      );
    });
  });

  describe("a player structure's own book", () => {
    const STRUCTURE = 1_000_000_000_001;
    const structureRow = openOrderRow({ locationId: STRUCTURE, stationName: null });

    it('waits for the station lookup to load before treating the location as a structure', async () => {
      const loaders = fakeOrderDetailLoaders();
      const book = { competitors: [], fetchedAt: 1, truncated: false };
      loaders.structureCompetition.mockResolvedValue(book);
      const { result, rerender } = renderOpenDetail(loaders, structureRow, {
        ...SNAPSHOT,
        stationsLoaded: false,
      });
      expect(loaders.structureCompetition).not.toHaveBeenCalled();

      rerender({ row: structureRow, snapshot: SNAPSHOT });

      expect(loaders.structureCompetition).toHaveBeenCalledWith(1, STRUCTURE);
      await waitFor(() => expect(result.current.view.structureMarket).toBe(book));
    });

    it('never retries an unreadable structure on its own, only from "check deeper"', async () => {
      const loaders = fakeOrderDetailLoaders();
      const { result, rerender } = renderOpenDetail(loaders, structureRow);
      await waitFor(() => expect(loaders.structureCompetition).toHaveBeenCalledTimes(1));

      // A background refresh hands over a newer snapshot.
      rerender({ row: structureRow, snapshot: { ...SNAPSHOT } });
      await act(async () => {});
      expect(loaders.structureCompetition).toHaveBeenCalledTimes(1);

      act(() => result.current.checkDeeper());
      expect(loaders.structureCompetition).toHaveBeenCalledTimes(2);
    });

    it('is not asked for at an NPC station', () => {
      const loaders = fakeOrderDetailLoaders();
      const { result } = renderOpenDetail(loaders);
      act(() => result.current.checkDeeper());
      expect(loaders.structureCompetition).not.toHaveBeenCalled();
    });
  });

  describe('check deeper', () => {
    it('retries a region book that failed', async () => {
      const loaders = fakeOrderDetailLoaders();
      loaders.regionCompetition.mockRejectedValueOnce(new Error('ESI 502'));
      const { result } = renderOpenDetail(loaders);
      await waitFor(() => expect(result.current.view.loadingDeep).toBe(false));

      act(() => result.current.checkDeeper());

      expect(loaders.regionCompetition).toHaveBeenCalledTimes(2);
      expect(result.current.view.loadingDeep).toBe(true);
    });
  });

  describe('a whole group at once', () => {
    it('checks each distinct item once, however many orders hold it', () => {
      const loaders = fakeOrderDetailLoaders();
      const { result } = renderHook(() => useOrderDetail(), {
        wrapper: ({ children }: { children: ReactNode }) =>
          withOrderDetailLoaders(children, loaders),
      });

      act(() =>
        result.current.checkDeeper([
          openOrderRow({ orderId: 1, typeId: 34 }),
          openOrderRow({ orderId: 2, typeId: 34, characterId: 2 }),
          openOrderRow({ orderId: 3, typeId: 35 }),
        ])
      );

      expect(loaders.regionCompetition).toHaveBeenCalledTimes(2);
      expect(loaders.regionCompetition).toHaveBeenCalledWith(REGION, 34);
      expect(loaders.regionCompetition).toHaveBeenCalledWith(REGION, 35);
    });
  });
});
