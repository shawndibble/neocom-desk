import { describe, expect, it } from 'vitest';
import { salesTax } from '@/engine/industry/fees';
import type { ReachableBuyOrder } from '@/engine/market/buyReach';
import type { HubOrder } from '@/engine/market/haulingMarket';
import { planLpSpend, type SpendCandidate, type SpendPlanInput } from './spendPlan';

const STATION = 60003760;
const TAG = 34;
const AMMO = 35;
const SHIP = 600;

function sell(price: number, volume: number): HubOrder {
  return { price, volume_remain: volume, is_buy_order: false, location_id: STATION };
}
function bid(price: number, volumeRemain: number): ReachableBuyOrder {
  return { price, volumeRemain, range: 'station', locationId: STATION, systemId: 1 };
}
const net = (revenue: number): number => revenue - salesTax(revenue, 0);

function offer(over: Partial<SpendCandidate> & { offerId: number }): SpendCandidate {
  return {
    lpCost: 100,
    iskCost: 0,
    buildCost: 0,
    requiredItems: [],
    outputTypeId: SHIP,
    outputUnits: 1,
    ...over,
  };
}

function input(over: Partial<SpendPlanInput> = {}): SpendPlanInput {
  return {
    candidates: [offer({ offerId: 1 })],
    lpBalance: 1000,
    walletBalance: null,
    lpValue: { rate: null, source: null },
    stationId: STATION,
    sellBooks: new Map(),
    buyBooks: new Map([[SHIP, [bid(100_000, 100)]]]),
    owned: new Map(),
    skills: {},
    ...over,
  };
}

describe('planLpSpend', () => {
  it('spends the LP on one offer until it runs out, and says so', () => {
    const plan = planLpSpend(input({ lpBalance: 350 }));
    expect(plan.rows).toEqual([
      expect.objectContaining({ offerId: 1, redemptions: 3, lpSpent: 300 }),
    ]);
    expect(plan.lpLeft).toBe(50);
    expect(plan.stop).toMatchObject({ reason: 'lpExhausted', offerId: 1 });
    expect(plan.rows[0]!.income).toBeCloseTo(net(300_000));
  });

  it('two offers selling the same output never sell more than its buy book takes', () => {
    const plan = planLpSpend(
      input({
        candidates: [offer({ offerId: 1 }), offer({ offerId: 2, lpCost: 110 })],
        buyBooks: new Map([[SHIP, [bid(100_000, 3), bid(1_000, 1000)]]]),
        lpBalance: 10_000,
      })
    );
    const sold = plan.rows.reduce((sum, row) => sum + row.redemptions, 0);
    expect(sold).toBe(3);
    expect(plan.totals.revenue).toBe(300_000);
    expect(plan.stop).toMatchObject({ reason: 'belowFloor', floor: { source: 'best' } });
  });

  it('two offers needing the same required item never price the same sell-book units', () => {
    const plan = planLpSpend(
      input({
        candidates: [
          offer({ offerId: 1, requiredItems: [{ typeId: TAG, quantity: 1 }] }),
          offer({ offerId: 2, requiredItems: [{ typeId: TAG, quantity: 1 }], outputTypeId: 601 }),
        ],
        sellBooks: new Map([[TAG, [sell(1_000, 2), sell(50_000, 100)]]]),
        buyBooks: new Map([
          [SHIP, [bid(100_000, 1)]],
          [601, [bid(90_000, 10)]],
        ]),
        lpBalance: 300,
        lpValue: { rate: 1, source: 'yours' },
      })
    );
    expect(plan.rows.map((r) => [r.offerId, r.redemptions])).toEqual([
      [1, 1],
      [2, 2],
    ]);
    expect(plan.totals.turnInsCost).toBe(2 * 1_000 + 50_000);
    const bought = plan.rows.flatMap((r) => r.turnIns).reduce((s, t) => s + t.bought, 0);
    expect(bought).toBe(3);
  });

  it('consumes owned turn-ins before buying, at zero cost', () => {
    const plan = planLpSpend(
      input({
        candidates: [offer({ offerId: 1, requiredItems: [{ typeId: AMMO, quantity: 10 }] })],
        sellBooks: new Map([[AMMO, [sell(100, 1000)]]]),
        owned: new Map([[AMMO, 15]]),
        lpBalance: 300,
      })
    );
    expect(plan.rows[0]).toMatchObject({
      redemptions: 3,
      turnIns: [{ typeId: AMMO, owned: 15, bought: 15 }],
      turnInsCost: 1_500,
    });
  });

  it('leaves an offer unpriced, never free, when the sell book cannot fill a required item', () => {
    const plan = planLpSpend(
      input({
        candidates: [
          offer({ offerId: 1, requiredItems: [{ typeId: TAG, quantity: 5 }], lpCost: 50 }),
          offer({ offerId: 2 }),
        ],
        sellBooks: new Map([[TAG, [sell(10, 7)]]]),
        lpBalance: 1000,
      })
    );
    expect(plan.rows.find((r) => r.offerId === 1)?.redemptions).toBe(1);
    expect(plan.unpriced).toEqual([1]);
  });

  it('treats an output with no buy book as unpriced', () => {
    const plan = planLpSpend(input({ buyBooks: new Map() }));
    expect(plan.rows).toEqual([]);
    expect(plan.unpriced).toEqual([1]);
    expect(plan.stop).toMatchObject({ reason: 'nothingProfitable', offerId: null });
  });

  it('stops at nothing profitable and names the offer', () => {
    const plan = planLpSpend(input({ candidates: [offer({ offerId: 1, iskCost: 200_000 })] }));
    expect(plan.rows).toEqual([]);
    expect(plan.stop).toMatchObject({ reason: 'nothingProfitable', offerId: 1 });
  });

  it('never takes a step under a typed LP Value', () => {
    const plan = planLpSpend(
      input({
        buyBooks: new Map([[SHIP, [bid(100_000, 2), bid(50_000, 100)]]]),
        lpValue: { rate: 600, source: 'yours' },
      })
    );
    expect(plan.rows[0]!.redemptions).toBe(2);
    expect(plan.stop).toMatchObject({
      reason: 'belowFloor',
      offerId: 1,
      floor: { rate: 600, source: 'yours' },
    });
    expect(plan.stop.iskPerLp).toBeCloseTo(net(50_000) / 100);
  });

  it("never takes a step under the store's market rate when no LP Value is typed", () => {
    const plan = planLpSpend(
      input({
        buyBooks: new Map([[SHIP, [bid(100_000, 2), bid(80_000, 100)]]]),
        lpValue: { rate: 800, source: 'market' },
      })
    );
    expect(plan.rows[0]!.redemptions).toBe(2);
    expect(plan.stop).toMatchObject({ reason: 'belowFloor', floor: { source: 'market' } });
  });

  it('falls back to 70% of the best step with no rate', () => {
    const plan = planLpSpend(
      input({ buyBooks: new Map([[SHIP, [bid(100_000, 1), bid(80_000, 1), bid(60_000, 100)]]]) })
    );
    expect(plan.rows[0]!.redemptions).toBe(2);
    expect(plan.stop.floor).toMatchObject({ source: 'best' });
    expect(plan.stop.floor!.rate).toBeCloseTo((0.7 * net(100_000)) / 100);
    expect(plan.stop.floor).toMatchObject({ best: net(100_000) / 100 });
  });

  it('caps purchases at a known wallet and says so', () => {
    const plan = planLpSpend(
      input({
        candidates: [offer({ offerId: 1, iskCost: 10_000, buildCost: 5_000 })],
        walletBalance: 40_000,
      })
    );
    expect(plan.rows[0]!.redemptions).toBe(2);
    expect(plan.totals.purchases).toBe(30_000);
    expect(plan.stop).toMatchObject({ reason: 'wallet', offerId: 1 });
  });

  it('skips a step the wallet cannot cover and takes the next affordable one', () => {
    const plan = planLpSpend(
      input({
        candidates: [
          offer({ offerId: 1, iskCost: 50_000, outputTypeId: AMMO }),
          offer({ offerId: 2 }),
        ],
        lpBalance: 300,
        walletBalance: 40_000,
        buyBooks: new Map([
          [AMMO, [bid(300_000, 100)]],
          [SHIP, [bid(100_000, 100)]],
        ]),
      })
    );
    expect(plan.rows).toEqual([expect.objectContaining({ offerId: 2, redemptions: 3 })]);
    expect(plan.stop.reason).toBe('lpExhausted');
  });

  it('stops at the wallet when no affordable step remains, naming the best one', () => {
    const plan = planLpSpend(
      input({
        candidates: [
          offer({ offerId: 1, iskCost: 50_000, outputTypeId: AMMO }),
          offer({ offerId: 2, iskCost: 60_000 }),
        ],
        walletBalance: 40_000,
        buyBooks: new Map([
          [AMMO, [bid(300_000, 100)]],
          [SHIP, [bid(200_000, 100)]],
        ]),
      })
    );
    expect(plan.rows).toEqual([]);
    expect(plan.stop).toMatchObject({ reason: 'wallet', offerId: 1 });
  });

  it('blames the loss, not the wallet, when the step it cannot cover would lose ISK', () => {
    const plan = planLpSpend(
      input({
        candidates: [offer({ offerId: 1, iskCost: 500_000 })],
        walletBalance: 40_000,
      })
    );
    expect(plan.stop).toMatchObject({ reason: 'nothingProfitable', offerId: 1 });
  });

  it('shares a blueprint product buy book with an offer that sells the product', () => {
    const plan = planLpSpend(
      input({
        candidates: [
          offer({ offerId: 1, outputTypeId: SHIP, outputUnits: 1, buildCost: 1_000 }),
          offer({ offerId: 2, outputTypeId: SHIP, outputUnits: 1 }),
        ],
        buyBooks: new Map([[SHIP, [bid(100_000, 3)]]]),
        lpBalance: 10_000,
      })
    );
    expect(plan.rows.reduce((s, r) => s + r.redemptions, 0)).toBe(3);
  });

  it('caps a bait bid at the Traded Price Ceiling', () => {
    const plan = planLpSpend(
      input({
        candidates: [offer({ offerId: 1, outputPriceCeiling: 10_000 })],
        lpBalance: 100,
      })
    );
    expect(plan.totals.revenue).toBe(10_000);
  });

  it('totals equal the sum of rows and LP left is balance minus LP spent', () => {
    const plan = planLpSpend(
      input({
        candidates: [
          offer({ offerId: 1, requiredItems: [{ typeId: TAG, quantity: 1 }], iskCost: 1_000 }),
          offer({ offerId: 2, outputTypeId: 601, lpCost: 70 }),
        ],
        sellBooks: new Map([[TAG, [sell(500, 3), sell(900, 100)]]]),
        buyBooks: new Map([
          [SHIP, [bid(100_000, 2), bid(90_000, 100)]],
          [601, [bid(65_000, 2), bid(60_000, 100)]],
        ]),
        lpBalance: 1_000,
      })
    );
    const sum = (pick: (r: (typeof plan.rows)[number]) => number) =>
      plan.rows.reduce((s, r) => s + pick(r), 0);
    expect(plan.rows.length).toBe(2);
    expect(plan.totals.lpSpent).toBe(sum((r) => r.lpSpent));
    expect(plan.totals.iskCost).toBeCloseTo(sum((r) => r.iskCost));
    expect(plan.totals.turnInsCost).toBeCloseTo(sum((r) => r.turnInsCost));
    expect(plan.totals.income).toBeCloseTo(sum((r) => r.income));
    expect(plan.totals.profit).toBeCloseTo(sum((r) => r.profit));
    expect(plan.lpLeft).toBe(1_000 - plan.totals.lpSpent);
  });
});
