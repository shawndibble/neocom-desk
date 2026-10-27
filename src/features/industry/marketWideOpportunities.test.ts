import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NO_CHARACTER_MODIFIERS } from '@/engine/industry/characterModifiers';
import { DEFAULT_TRADE_HUB } from '@/market/hubs';
import type { BlueprintSourceSets } from '@/engine/industry/blueprintObtainability';
import type { MarketWideTreeMap } from '@/sde/types';
import type { BlueprintCatalog } from './blueprintCatalog';
import type { CharacterBlueprint } from '@/esi/endpoints';
import { researchFor, runMarketWideScan } from './marketWideOpportunities';

vi.mock('@/market/prices', () => ({
  getHubPrices: vi.fn(),
  // Unreachable by default: the troll-price check is skipped, as in production.
  getAdjustedPrices: vi.fn(() => Promise.reject(new Error('offline'))),
}));
// Pricing is `marketWidePlanPricing.test.ts`'s concern; the scan's is which
// candidates survive, and that each is priced as the plan a click would open.
vi.mock('./marketWidePlanPricing', () => ({ priceCandidatesAsPlans: vi.fn() }));

import { getAdjustedPrices, getHubPrices } from '@/market/prices';
import { priceCandidatesAsPlans } from './marketWidePlanPricing';

const PRODUCT = 500;
const TRITANIUM = 34;

const TREES: MarketWideTreeMap = {
  [PRODUCT]: {
    blueprintTypeID: 501,
    time: 3600,
    outputQuantity: 1,
    marketGroupID: 1,
    materials: [{ typeID: TRITANIUM, quantity: 100 }],
  },
};
const NO_SOURCES: BlueprintSourceSets = {
  owned: new Set(),
  market: new Set(),
  contract: new Set(),
  lpStore: new Set(),
  invention: new Set(),
};
const ON_MARKET = Promise.resolve({ ...NO_SOURCES, market: new Set([501]) });
const CATALOG = { byBlueprintTypeID: new Map(), typesById: {} } as unknown as BlueprintCatalog;

beforeEach(() => {
  vi.mocked(getHubPrices).mockImplementation((_hub, typeIds) =>
    Promise.resolve(
      new Map(
        typeIds.map((id) => [
          id,
          id === PRODUCT
            ? { sellMin: 1_000_000, sellVolume: 1_000 }
            : { sellMin: 5, sellVolume: 1_000_000 },
        ])
      ) as unknown as Awaited<ReturnType<typeof getHubPrices>>
    )
  );
  vi.mocked(priceCandidatesAsPlans).mockImplementation((candidates) =>
    Promise.resolve(
      candidates.map((candidate) => ({
        productTypeID: candidate.productTypeID,
        profit: 1,
        marginPct: 1,
        seconds: 3600,
        iskPerHour: 1,
        buildCost: 1,
        outputQuantity: 1,
        sellDepthIsk: candidate.sellDepthIsk,
        me: candidate.me,
        te: candidate.te,
      }))
    )
  );
});

describe('runMarketWideScan', () => {
  it("prices each survivor as the Build Plan a click would open, for the active Character at the row's ME/TE", async () => {
    const research = { owned: [], assumedMe: 8, assumedTe: 14 };
    const rows = await runMarketWideScan(
      DEFAULT_TRADE_HUB,
      TREES,
      CATALOG,
      NO_CHARACTER_MODIFIERS,
      ON_MARKET,
      { research, characterId: 42 }
    );
    expect(rows.map((row) => [row.productTypeID, row.me, row.te])).toEqual([[PRODUCT, 8, 14]]);
    const [candidates, context] = vi.mocked(priceCandidatesAsPlans).mock.calls[0]!;
    expect(candidates.map((c) => c.productTypeID)).toEqual([PRODUCT]);
    expect(context).toMatchObject({
      hub: DEFAULT_TRADE_HUB,
      characterId: 42,
      modifiers: NO_CHARACTER_MODIFIERS,
      research,
    });
  });

  it('ranks only products whose blueprint the pilot owns or can buy, naming the source', async () => {
    const trees: MarketWideTreeMap = {
      ...TREES,
      [PRODUCT + 10]: { ...TREES[PRODUCT]!, blueprintTypeID: 511 },
      [PRODUCT + 20]: { ...TREES[PRODUCT]!, blueprintTypeID: 521 },
    };
    vi.mocked(getHubPrices).mockImplementation((_hub, typeIds) =>
      Promise.resolve(
        new Map(
          typeIds.map((id) => [
            id,
            id >= PRODUCT
              ? { sellMin: 1_000_000, sellVolume: 1_000 }
              : { sellMin: 5, sellVolume: 1 },
          ])
        ) as unknown as Awaited<ReturnType<typeof getHubPrices>>
      )
    );
    const rows = await runMarketWideScan(
      DEFAULT_TRADE_HUB,
      trees,
      CATALOG,
      NO_CHARACTER_MODIFIERS,
      Promise.resolve({ ...NO_SOURCES, owned: new Set([501]), contract: new Set([521]) })
    );
    expect(rows.map((row) => [row.productTypeID, row.blueprintSource]).sort()).toEqual([
      [PRODUCT, 'owned'],
      [PRODUCT + 20, 'contract'],
    ]);
  });

  it('drops products the filters exclude before the top-N cut, so they never take a kept one’s slot', async () => {
    const FACTION = PRODUCT + 1;
    const trees: MarketWideTreeMap = {
      ...TREES,
      [FACTION]: { ...TREES[PRODUCT]!, blueprintTypeID: 502 },
    };
    vi.mocked(getHubPrices).mockImplementation((_hub, typeIds) =>
      Promise.resolve(
        new Map(
          typeIds.map((id) => [
            id,
            id === FACTION
              ? { sellMin: 1_000_000, sellVolume: 100_000 }
              : id === PRODUCT
                ? { sellMin: 1_000_000, sellVolume: 1_000 }
                : { sellMin: 5, sellVolume: 1 },
          ])
        ) as unknown as Awaited<ReturnType<typeof getHubPrices>>
      )
    );
    const rows = await runMarketWideScan(
      DEFAULT_TRADE_HUB,
      trees,
      CATALOG,
      NO_CHARACTER_MODIFIERS,
      Promise.resolve({ ...NO_SOURCES, market: new Set([501, 502]) }),
      {
        topNPerMarketGroup: 1,
        include: Promise.resolve((productTypeID) => productTypeID !== FACTION),
      }
    );
    expect(rows.map((row) => row.productTypeID)).toEqual([PRODUCT]);
  });

  it('prices a troll sell order at the average it trades at, so it neither outranks nor out-slots a real one', async () => {
    const TROLL = PRODUCT + 1;
    const trees: MarketWideTreeMap = {
      ...TREES,
      [TROLL]: { ...TREES[PRODUCT]!, blueprintTypeID: 502 },
    };
    vi.mocked(getHubPrices).mockImplementation((_hub, typeIds) =>
      Promise.resolve(
        new Map(
          typeIds.map((id) => [
            id,
            id === TROLL
              ? { sellMin: 1_000_000_000_000, sellVolume: 1 } // one joke order
              : id === PRODUCT
                ? { sellMin: 1_000_000, sellVolume: 1_000 }
                : { sellMin: 5, sellVolume: 1 },
          ])
        ) as unknown as Awaited<ReturnType<typeof getHubPrices>>
      )
    );
    vi.mocked(getAdjustedPrices).mockResolvedValueOnce(
      new Map([
        [PRODUCT, { adjusted: 900_000, average: 900_000 }],
        [TROLL, { adjusted: 1_000_000, average: 1_000_000 }],
      ])
    );
    const rows = await runMarketWideScan(
      DEFAULT_TRADE_HUB,
      trees,
      CATALOG,
      NO_CHARACTER_MODIFIERS,
      Promise.resolve({ ...NO_SOURCES, market: new Set([501, 502]) }),
      { topNPerMarketGroup: 1, liquidityFloorIsk: 1 }
    );
    // Priced at its 1M average, the troll's depth is 1M, under the real
    // product's 1B, so the real product keeps the group's one slot.
    expect(rows.map((row) => [row.productTypeID, row.priceCapped])).toEqual([[PRODUCT, false]]);
  });

  it('drops unobtainable products before the top-N cut, so they never take an obtainable one’s slot', async () => {
    const DEEP = PRODUCT + 1;
    const trees: MarketWideTreeMap = {
      ...TREES,
      [DEEP]: { ...TREES[PRODUCT]!, blueprintTypeID: 999 },
    };
    vi.mocked(getHubPrices).mockImplementation((_hub, typeIds) =>
      Promise.resolve(
        new Map(
          typeIds.map((id) => [
            id,
            id === DEEP
              ? { sellMin: 1_000_000, sellVolume: 100_000 }
              : id === PRODUCT
                ? { sellMin: 1_000_000, sellVolume: 1_000 }
                : { sellMin: 5, sellVolume: 1 },
          ])
        ) as unknown as Awaited<ReturnType<typeof getHubPrices>>
      )
    );
    const rows = await runMarketWideScan(
      DEFAULT_TRADE_HUB,
      trees,
      CATALOG,
      NO_CHARACTER_MODIFIERS,
      ON_MARKET,
      { topNPerMarketGroup: 1 }
    );
    expect(rows.map((row) => row.productTypeID)).toEqual([PRODUCT]);
  });
});

describe('researchFor', () => {
  const copy = (type_id: number, runs: number, me: number, te: number) =>
    ({
      type_id,
      runs,
      material_efficiency: me,
      time_efficiency: te,
    }) as CharacterBlueprint;
  const assumed = { assumedMe: 3, assumedTe: 4 };

  it('uses the assumed ME/TE for a blueprint the Character does not own', () => {
    expect(researchFor(10, { owned: [], ...assumed })).toEqual({ me: 3, te: 4 });
  });

  it('prefers the owned copy’s research, even when it is 0/0', () => {
    expect(researchFor(10, { owned: [copy(10, -1, 10, 20)], ...assumed })).toEqual({
      me: 10,
      te: 20,
    });
    expect(researchFor(10, { owned: [copy(10, -1, 0, 0)], ...assumed })).toEqual({ me: 0, te: 0 });
  });

  it('reads the same copy a plan would: the original, else the best-ME copy', () => {
    const owned = [copy(10, 5, 9, 18), copy(10, 3, 4, 8)];
    expect(researchFor(10, { owned, ...assumed })).toEqual({ me: 9, te: 18 });
    expect(researchFor(10, { owned: [...owned, copy(10, -1, 1, 2)], ...assumed })).toEqual({
      me: 1,
      te: 2,
    });
  });
});
