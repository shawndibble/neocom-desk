import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { FUZZWORK_AGGREGATES_URL } from '@/market/fuzzwork';
import { clearMarketPriceCache } from '@/market/prices';
import { DEFAULT_TRADE_HUB, TRADE_HUBS } from '@/market/hubs';
import { SKILL_IDS } from '@/engine/industry/types';
import { loadReprocessing } from '@/sde/loadSde';
import { loadCorrectedSkills, type CorrectedSkills } from '@/features/skills/correctedSkills';
import { findLpOfferMatches, toLpOfferInputs } from '@/features/market/appraisalLpAcquisition';
import { appraisePaste, clearAppraisalCatalogue, compareHubs } from './appraisalData';

vi.mock('@/sde/loadMarketSde', () => ({
  loadMarketTypes: vi.fn(async () => [
    { typeId: 34, name: 'Tritanium', marketGroupId: 18 },
    { typeId: 2048, name: 'Damage Control II', marketGroupId: 300 },
    { typeId: 999, name: 'Civilian Gatling Railgun', marketGroupId: 300 },
    { typeId: 1230, name: 'Veldspar', marketGroupId: 402 },
  ]),
}));

vi.mock('@/sde/loadSde', () => ({ loadReprocessing: vi.fn() }));
vi.mock('@/features/skills/correctedSkills', () => ({ loadCorrectedSkills: vi.fn() }));
vi.mock('@/features/market/appraisalLpAcquisition', () => ({
  findLpOfferMatches: vi.fn(),
  toLpOfferInputs: vi.fn(),
}));

const mockedLoadReprocessing = vi.mocked(loadReprocessing);
const mockedLoadCorrectedSkills = vi.mocked(loadCorrectedSkills);
const mockedFindLpOfferMatches = vi.mocked(findLpOfferMatches);
const mockedToLpOfferInputs = vi.mocked(toLpOfferInputs);

function skillsFixture(trained: [number, number][]): CorrectedSkills {
  return {
    skillsResult: null,
    skillsNeedsReauth: false,
    queueResult: null,
    queueNeedsReauth: false,
    completedLevels: new Map(),
    trained: new Map(trained.map(([id, level]) => [id, { level, sp: 0 }])),
    completedSp: 0,
    totalSp: null,
    fetchedAt: null,
  };
}

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  clearMarketPriceCache();
  clearAppraisalCatalogue();
  mockedLoadReprocessing.mockReset();
  mockedLoadCorrectedSkills.mockReset();
  mockedFindLpOfferMatches.mockReset();
  mockedToLpOfferInputs.mockReset();
});
afterAll(() => server.close());

function aggregates(body: Record<string, unknown>) {
  return http.get(FUZZWORK_AGGREGATES_URL, () => HttpResponse.json(body));
}

const PRICED = {
  34: {
    buy: { min: '5.0', max: '5.41', volume: '100', orderCount: '4' },
    sell: { min: '5.62', max: '6.0', volume: '200', orderCount: '9' },
  },
  2048: {
    buy: { min: '400000', max: '498500', volume: '10', orderCount: '3' },
    sell: { min: '512000', max: '600000', volume: '20', orderCount: '7' },
  },
  // Nobody is buying this one: orderCount 0 on the buy side.
  999: {
    buy: { min: '0', max: '0', volume: '0', orderCount: '0' },
    sell: { min: '1000', max: '1200', volume: '5', orderCount: '2' },
  },
};

describe('appraisePaste', () => {
  it('resolves names, prices both sides and scales by the percentage', async () => {
    server.use(aggregates(PRICED));

    const outcome = await appraisePaste('Damage Control II\t3', DEFAULT_TRADE_HUB, 90);

    expect(outcome.appraisal.rows).toEqual([
      {
        typeId: 2048,
        name: 'Damage Control II',
        quantity: 3,
        buyEach: 448_650,
        sellEach: 460_800,
        buyTotal: 1_345_950,
        sellTotal: 1_382_400,
      },
    ]);
    expect(outcome.unmatched).toEqual([]);
  });

  it('reports a name the catalogue does not hold, with its line number', async () => {
    server.use(aggregates(PRICED));

    const text = ['Tritanium\t100', 'Nanite Repair Past\t2'].join('\n');
    const outcome = await appraisePaste(text, DEFAULT_TRADE_HUB, 100);

    expect(outcome.appraisal.rows.map((row) => row.name)).toEqual(['Tritanium']);
    expect(outcome.unmatched).toEqual([{ name: 'Nanite Repair Past', lines: [2] }]);
  });

  it('leaves a side with no orders out of the total rather than pricing it at zero', async () => {
    server.use(aggregates(PRICED));

    const text = ['Damage Control II\t1', 'Civilian Gatling Railgun\t4'].join('\n');
    const { appraisal } = await appraisePaste(text, DEFAULT_TRADE_HUB, 100);

    const railgun = appraisal.rows[1];
    expect(railgun.buyEach).toBeNull();
    expect(railgun.buyTotal).toBeNull();
    expect(railgun.sellTotal).toBe(4_000);
    expect(appraisal.totals.buy).toBe(498_500);
    expect(appraisal.totals.unpricedRows).toBe(1);
  });

  it('prices nothing as free when Fuzzwork is unreachable', async () => {
    server.use(http.get(FUZZWORK_AGGREGATES_URL, () => HttpResponse.error()));

    const { appraisal } = await appraisePaste('Tritanium\t100', DEFAULT_TRADE_HUB, 100);

    expect(appraisal.rows[0].buyTotal).toBeNull();
    expect(appraisal.rows[0].sellTotal).toBeNull();
    expect(appraisal.totals.sell).toBe(0);
    expect(appraisal.totals.unpricedRows).toBe(1);
  });

  it('makes no price request for a paste that matches nothing', async () => {
    let hits = 0;
    server.use(
      http.get(FUZZWORK_AGGREGATES_URL, () => {
        hits += 1;
        return HttpResponse.json({});
      })
    );

    const { appraisal, unmatched } = await appraisePaste('Nope\t1', DEFAULT_TRADE_HUB, 100);

    expect(appraisal.rows).toEqual([]);
    expect(unmatched).toHaveLength(1);
    expect(hits).toBe(0);
  });

  it('merges the same item pasted twice into one priced row', async () => {
    server.use(aggregates(PRICED));

    const text = ['Tritanium\t100', 'Tritanium\t50'].join('\n');
    const { appraisal } = await appraisePaste(text, DEFAULT_TRADE_HUB, 100);

    expect(appraisal.rows).toHaveLength(1);
    expect(appraisal.rows[0].quantity).toBe(150);
  });

  describe('refine-then-sell (issue #672)', () => {
    /** One portion of 100 Veldspar returns 415 Tritanium at 100% efficiency. */
    const VELDSPAR_ENTRY = { portionSize: 100, materials: [{ typeID: 34, quantity: 415 }] };

    it('fetches neither reprocessing data nor skills with no active Character', async () => {
      server.use(aggregates(PRICED));

      const { appraisal } = await appraisePaste('Tritanium\t100', DEFAULT_TRADE_HUB, 100, null);

      expect(mockedLoadReprocessing).not.toHaveBeenCalled();
      expect(mockedLoadCorrectedSkills).not.toHaveBeenCalled();
      expect(appraisal.rows[0].refineTotal).toBeUndefined();
      expect(appraisal.totals.refine).toBe(0);
    });

    it('adds a refine value for a reprocessable row when a Character is active', async () => {
      server.use(
        aggregates({
          ...PRICED,
          1230: {
            buy: { min: '4', max: '5', volume: '1000', orderCount: '2' },
            sell: { min: '6', max: '7', volume: '1000', orderCount: '2' },
          },
        })
      );
      mockedLoadReprocessing.mockResolvedValue({ '1230': VELDSPAR_ENTRY });
      mockedLoadCorrectedSkills.mockResolvedValue(skillsFixture([]));

      const { appraisal } = await appraisePaste('Veldspar\t1000', DEFAULT_TRADE_HUB, 100, 1);

      expect(mockedLoadCorrectedSkills).toHaveBeenCalledWith(1, expect.any(Number));
      const row = appraisal.rows[0];
      // 10 batches x floor(415 x 10 x 0.5) Tritanium x 5.41 ISK (Tritanium's buyMax)
      expect(row.refineTotal).toBeCloseTo(Math.floor(415 * 10 * 0.5) * 5.41, 6);
      expect(row.refinePricedAll).toBe(true);
      expect(appraisal.totals.refine).toBe(row.refineTotal);
    });

    it('leaves a non-reprocessable row without a refine value even with a Character active', async () => {
      server.use(aggregates(PRICED));
      mockedLoadReprocessing.mockResolvedValue({});
      mockedLoadCorrectedSkills.mockResolvedValue(skillsFixture([]));

      const { appraisal } = await appraisePaste('Damage Control II\t3', DEFAULT_TRADE_HUB, 100, 1);

      expect(appraisal.rows[0].refineTotal).toBeUndefined();
    });

    it('reports a material with no price at the hub as partially priced, not free', async () => {
      // Tritanium (34) is not in this response at all, so it has no buy price.
      server.use(aggregates({}));
      mockedLoadReprocessing.mockResolvedValue({ '1230': VELDSPAR_ENTRY });
      mockedLoadCorrectedSkills.mockResolvedValue(skillsFixture([]));

      const { appraisal } = await appraisePaste('Veldspar\t1000', DEFAULT_TRADE_HUB, 100, 1);

      const row = appraisal.rows[0];
      expect(row.refineTotal).toBe(0);
      expect(row.refinePricedAll).toBe(false);
    });

    it('recomputes using the given Character’s own reprocessing skills', async () => {
      server.use(
        aggregates({
          ...PRICED,
          1230: {
            buy: { min: '4', max: '5', volume: '1000', orderCount: '2' },
            sell: { min: '6', max: '7', volume: '1000', orderCount: '2' },
          },
        })
      );
      mockedLoadReprocessing.mockResolvedValue({ '1230': VELDSPAR_ENTRY });
      mockedLoadCorrectedSkills.mockResolvedValue(
        skillsFixture([
          [SKILL_IDS.reprocessing, 5],
          [SKILL_IDS.reprocessingEfficiency, 5],
        ])
      );

      const { appraisal } = await appraisePaste('Veldspar\t1000', DEFAULT_TRADE_HUB, 100, 1);

      // efficiency = 0.5 x 1.15 x 1.10 (Veldspar carries no specialisationSkillID
      // in this fixture, so it falls back to Scrapmetal Processing, untrained
      // here — that term is x1). Tritanium's buyMax is 5.41.
      const efficiency = 0.5 * 1.15 * 1.1;
      const expected = Math.floor(415 * 10 * efficiency) * 5.41;
      expect(appraisal.rows[0].refineTotal).toBeCloseTo(expected, 6);
    });

    it('resolves each row against its own specialisation skill (issue #1058)', async () => {
      // Veldspar carries the SDE's attribute-790 join to Simple Ore
      // Processing; Damage Control II carries none, so it falls back to
      // Scrapmetal Processing — a mixed paste resolves each independently.
      const SIMPLE_ORE_PROCESSING = 60377;
      server.use(aggregates(PRICED));
      mockedLoadReprocessing.mockResolvedValue({
        '1230': { ...VELDSPAR_ENTRY, specialisationSkillID: SIMPLE_ORE_PROCESSING },
        '2048': { portionSize: 1, materials: [{ typeID: 34, quantity: 100 }] },
      });
      mockedLoadCorrectedSkills.mockResolvedValue(
        skillsFixture([
          [SIMPLE_ORE_PROCESSING, 5],
          [SKILL_IDS.scrapmetalProcessing, 0],
        ])
      );

      const { appraisal } = await appraisePaste(
        'Veldspar\t1000\nDamage Control II\t1',
        DEFAULT_TRADE_HUB,
        100,
        1
      );

      // Veldspar: 0.5 x 1.10 (Simple Ore Processing V) = 0.55 -> floor(415*10*0.55) = 2282
      const veldsparRow = appraisal.rows.find((row) => row.typeId === 1230)!;
      expect(veldsparRow.refineTotal).toBeCloseTo(2282 * 5.41, 6);
      // Damage Control II: 0.5 x 1.0 (untrained Scrapmetal) -> floor(100*0.5) = 50
      const dcuRow = appraisal.rows.find((row) => row.typeId === 2048)!;
      expect(dcuRow.refineTotal).toBeCloseTo(50 * 5.41, 6);
    });
  });

  describe('LP store acquisition', () => {
    it('fetches no LP matches with no active Character', async () => {
      server.use(aggregates(PRICED));

      await appraisePaste('Tritanium\t100', DEFAULT_TRADE_HUB, 100, null);

      expect(mockedFindLpOfferMatches).not.toHaveBeenCalled();
    });

    it('attaches the cheapest LP option to a matching row', async () => {
      server.use(aggregates(PRICED));
      mockedLoadReprocessing.mockResolvedValue({});
      mockedLoadCorrectedSkills.mockResolvedValue(skillsFixture([]));
      mockedFindLpOfferMatches.mockResolvedValue({
        matchesByTypeId: new Map([
          [2048, [{ corpName: 'Test Corp', offer: {} as never, playerLp: 0 }]],
        ]),
        requiredItemTypeIds: [],
      });
      mockedToLpOfferInputs.mockReturnValue([
        {
          corpName: 'Test Corp',
          quantityPerRedemption: 1,
          lpCostPerRedemption: 100_000,
          iskCostPerRedemption: 200_000,
          requiredItemsCostPerRedemption: 0,
          playerLp: 500_000,
        },
      ]);

      const { appraisal } = await appraisePaste('Damage Control II\t3', DEFAULT_TRADE_HUB, 100, 1);

      const row = appraisal.rows[0];
      expect(row.lpCorpName).toBe('Test Corp');
      // 3 units at 1-per-redemption needs 3 redemptions.
      expect(row.lpIskCost).toBe(600_000);
      expect(row.lpAffordable).toBe(true);
      // The LP option (600,000) beats the market sell total (1,382,400).
      expect(appraisal.totals.cheapestBuy).toBe(600_000);
      expect(appraisal.totals.cheapestBuyViaLp).toBe(1);
    });

    it('widens the price fetch with required-item type ids from matched offers', async () => {
      server.use(aggregates(PRICED));
      mockedLoadReprocessing.mockResolvedValue({});
      mockedLoadCorrectedSkills.mockResolvedValue(skillsFixture([]));
      mockedFindLpOfferMatches.mockResolvedValue({
        matchesByTypeId: new Map(),
        requiredItemTypeIds: [1230],
      });

      await appraisePaste('Damage Control II\t3', DEFAULT_TRADE_HUB, 100, 1);

      // getHubPrices is called through Fuzzwork; the widened batch is only
      // observable via the request itself, so assert on the mocked adapter's
      // own inputs instead of a second network round trip.
      expect(mockedFindLpOfferMatches).toHaveBeenCalledWith(1, [2048]);
    });

    it('leaves a row untouched when nothing the character holds LP with sells it', async () => {
      server.use(aggregates(PRICED));
      mockedLoadReprocessing.mockResolvedValue({});
      mockedLoadCorrectedSkills.mockResolvedValue(skillsFixture([]));
      mockedFindLpOfferMatches.mockResolvedValue({
        matchesByTypeId: new Map(),
        requiredItemTypeIds: [],
      });

      const { appraisal } = await appraisePaste('Damage Control II\t3', DEFAULT_TRADE_HUB, 100, 1);

      expect(appraisal.rows[0].lpCorpName).toBeUndefined();
      expect(appraisal.totals.cheapestBuy).toBe(appraisal.totals.sell);
      expect(appraisal.totals.cheapestBuyViaLp).toBe(0);
    });
  });
});

describe('compareHubs', () => {
  it('prices the pile at every Trade Hub, one batched call each', async () => {
    let hits = 0;
    server.use(
      http.get(FUZZWORK_AGGREGATES_URL, () => {
        hits += 1;
        return HttpResponse.json(PRICED);
      })
    );

    const rows = await compareHubs('Damage Control II\t3', 90);

    expect(hits).toBe(TRADE_HUBS.length);
    expect(rows.map((row) => row.hub)).toEqual(TRADE_HUBS);
    // Same aggregate served for every hub in this fixture, so every row
    // matches the primary appraisal's own totals at the same percentage.
    for (const row of rows) {
      expect(row.buy).toBe(1_345_950);
      expect(row.sell).toBe(1_382_400);
    }
  });

  it('reports a hub with no orders on a side as null, not zero', async () => {
    server.use(aggregates(PRICED));

    const rows = await compareHubs('Civilian Gatling Railgun\t4', 100);

    for (const row of rows) {
      expect(row.buy).toBeNull();
      expect(row.sell).toBe(4_000);
    }
  });

  it('makes no price request for a paste that matches nothing', async () => {
    let hits = 0;
    server.use(
      http.get(FUZZWORK_AGGREGATES_URL, () => {
        hits += 1;
        return HttpResponse.json({});
      })
    );

    const rows = await compareHubs('Nope\t1', 100);

    expect(hits).toBe(0);
    expect(rows).toHaveLength(TRADE_HUBS.length);
    expect(rows.every((row) => row.buy === null && row.sell === null)).toBe(true);
  });

  it('scales both sides by the given price percent', async () => {
    server.use(aggregates(PRICED));

    const rows = await compareHubs('Damage Control II\t3', 50);

    expect(rows[0].sell).toBe(768_000);
  });
});
