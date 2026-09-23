import { describe, it, expect, vi, beforeEach } from 'vitest';
import { characterModifiers, NO_CHARACTER_MODIFIERS } from '@/engine/industry/characterModifiers';
import { DEFAULT_TRADE_HUB } from '@/market/hubs';
import type { MarketWideTreeMap } from '@/sde/types';
import type { BlueprintCatalog } from './blueprintCatalog';
import { runMarketWideScan } from './marketWideOpportunities';

vi.mock('@/market/prices', () => ({ getHubPrices: vi.fn() }));
vi.mock('./marketData', () => ({ loadMarketSnapshot: vi.fn() }));

import { getHubPrices } from '@/market/prices';
import { loadMarketSnapshot } from './marketData';

const PRODUCT = 500;
const TRITANIUM = 34;
const BX_804 = 27171;

const TREES: MarketWideTreeMap = {
  [PRODUCT]: {
    blueprintTypeID: 501,
    time: 3600,
    outputQuantity: 1,
    marketGroupID: 1,
    materials: [{ typeID: TRITANIUM, quantity: 100 }],
  },
};
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
  vi.mocked(loadMarketSnapshot).mockResolvedValue({
    adjustedPrices: {},
    systemCostIndex: 0,
  } as unknown as Awaited<ReturnType<typeof loadMarketSnapshot>>);
});

describe('runMarketWideScan', () => {
  it("applies the Character's BX-80x implant to ISK/hour like every other pricing path (issue #1284)", async () => {
    const [base] = await runMarketWideScan(
      DEFAULT_TRADE_HUB,
      TREES,
      CATALOG,
      NO_CHARACTER_MODIFIERS
    );
    const [implanted] = await runMarketWideScan(
      DEFAULT_TRADE_HUB,
      TREES,
      CATALOG,
      characterModifiers({ skills: {}, implantTypeIds: [BX_804] })
    );
    // Same profit, 4% less time.
    expect(implanted.iskPerHour).toBeCloseTo(base.iskPerHour! / 0.96, 6);
  });
});
