import { describe, expect, it } from 'vitest';
import { multibuyText, planTrip, type TripCandidate } from './haulingPlan';

const FEES = {
  accountingLevel: 5,
  brokerRelationsLevel: 4,
  standing: { factionStanding: 0, corpStanding: 0 },
};

function candidate(over: Partial<TripCandidate> & { typeId: number }): TripCandidate {
  return {
    name: `Item ${over.typeId}`,
    unitVolumeM3: 1,
    buyLadder: [{ price: 100, units: 100_000, orders: 1 }],
    expectedPrice: 150,
    demandCapUnits: 1000,
    ...over,
  };
}

const NO_OVERRIDES = new Map();

describe('planTrip', () => {
  it('caps a load at a week of sales when nothing else binds', () => {
    const plan = planTrip({
      candidates: [candidate({ typeId: 1, demandCapUnits: 40 })],
      cargoM3: null,
      budgetIsk: null,
      fees: FEES,
      overrides: NO_OVERRIDES,
    });
    expect(plan.lines[0]).toMatchObject({ typeId: 1, quantity: 40, limitedBy: 'sales' });
  });

  it('never brings more than is profitable to buy at the origin', () => {
    const plan = planTrip({
      candidates: [
        candidate({
          typeId: 1,
          expectedPrice: 150,
          buyLadder: [
            { price: 100, units: 10, orders: 1 },
            { price: 500, units: 50, orders: 1 }, // costs more than it can sell for
          ],
        }),
      ],
      cargoM3: null,
      budgetIsk: null,
      fees: FEES,
      overrides: NO_OVERRIDES,
    });
    expect(plan.lines[0]).toMatchObject({ quantity: 10, limitedBy: 'supply' });
  });

  it('stops at the hold and says space was the limit', () => {
    const plan = planTrip({
      candidates: [candidate({ typeId: 1, unitVolumeM3: 10 })],
      cargoM3: 250,
      budgetIsk: null,
      fees: FEES,
      overrides: NO_OVERRIDES,
    });
    expect(plan.lines[0]).toMatchObject({ quantity: 25, limitedBy: 'space', volumeM3: 250 });
    expect(plan.binding).toBe('space');
  });

  it('stops at the budget and says budget was the limit', () => {
    const plan = planTrip({
      candidates: [candidate({ typeId: 1 })],
      cargoM3: 10_000,
      budgetIsk: 1_050,
      fees: FEES,
      overrides: NO_OVERRIDES,
    });
    expect(plan.lines[0]).toMatchObject({ quantity: 10, limitedBy: 'budget' });
    expect(plan.totals.cost).toBe(1000);
    expect(plan.binding).toBe('budget');
  });

  it('gives scarce space to the item that earns more per m³', () => {
    const plan = planTrip({
      candidates: [
        candidate({ typeId: 1, unitVolumeM3: 10, expectedPrice: 150 }), // ~+50 per 10 m³
        candidate({ typeId: 2, unitVolumeM3: 1, expectedPrice: 150 }), // ~+50 per 1 m³
      ],
      cargoM3: 100,
      budgetIsk: null,
      fees: FEES,
      overrides: NO_OVERRIDES,
    });
    const byId = new Map(plan.lines.map((l) => [l.typeId, l]));
    expect(byId.get(2)!.quantity).toBe(100);
    expect(byId.get(1)!.quantity).toBe(0);
  });

  it('an unticked item is left out and its space goes to the others', () => {
    const plan = planTrip({
      candidates: [
        candidate({ typeId: 1, unitVolumeM3: 1 }),
        candidate({ typeId: 2, unitVolumeM3: 1 }),
      ],
      cargoM3: 60,
      budgetIsk: null,
      fees: FEES,
      overrides: new Map([[1, { selected: false }]]),
    });
    const byId = new Map(plan.lines.map((l) => [l.typeId, l]));
    expect(byId.get(1)).toMatchObject({ quantity: 0, selected: false });
    expect(byId.get(2)!.quantity).toBe(60);
  });

  it('a typed quantity is kept as typed and reserves its space before the rest is filled', () => {
    const plan = planTrip({
      candidates: [
        candidate({ typeId: 1, unitVolumeM3: 1 }),
        candidate({ typeId: 2, unitVolumeM3: 1 }),
      ],
      cargoM3: 100,
      budgetIsk: null,
      fees: FEES,
      overrides: new Map([[1, { quantity: 30 }]]),
    });
    const byId = new Map(plan.lines.map((l) => [l.typeId, l]));
    expect(byId.get(1)).toMatchObject({ quantity: 30, limitedBy: 'edited' });
    expect(byId.get(2)!.quantity).toBe(70);
  });

  it('totals the profit, spend, m³ and item count of the lines that ship', () => {
    const plan = planTrip({
      candidates: [
        candidate({ typeId: 1, demandCapUnits: 10 }),
        candidate({ typeId: 2, demandCapUnits: 20 }),
      ],
      cargoM3: null,
      budgetIsk: null,
      fees: FEES,
      overrides: NO_OVERRIDES,
    });
    expect(plan.totals.items).toBe(2);
    expect(plan.totals.volumeM3).toBe(30);
    expect(plan.totals.cost).toBe(3000);
    expect(plan.totals.profit).toBeCloseTo(plan.lines.reduce((s, l) => s + l.profit, 0));
  });
});

describe('planTrip, selling into buy orders', () => {
  // Accounting V: 3.375% tax, no broker fee.
  const instant = (over: Partial<TripCandidate> & { typeId: number }) =>
    candidate({
      buyLadder: [
        { price: 100, units: 10, orders: 1 },
        { price: 105, units: 20, orders: 1 },
      ],
      destBuyLadder: [
        { price: 115, units: 5, orders: 1 },
        { price: 110, units: 12, orders: 1 },
        { price: 108, units: 100, orders: 1 },
      ],
      demandCapUnits: null,
      ...over,
    });

  it('sizes to the profitable depth of both books, not to a week of sales', () => {
    const plan = planTrip({
      candidates: [instant({ typeId: 1 })],
      cargoM3: null,
      budgetIsk: null,
      fees: FEES,
      overrides: NO_OVERRIDES,
    });
    expect(plan.lines[0]).toMatchObject({ quantity: 17, cost: 1735, limitedBy: 'supply' });
    expect(plan.lines[0]!.profit).toBeCloseTo(1895 - 1895 * 0.03375 - 1735);
    expect(plan.binding).toBeNull();
  });

  it('still stops at the hold', () => {
    const plan = planTrip({
      candidates: [instant({ typeId: 1, unitVolumeM3: 2 })],
      cargoM3: 20,
      budgetIsk: null,
      fees: FEES,
      overrides: NO_OVERRIDES,
    });
    expect(plan.lines[0]).toMatchObject({ quantity: 10, limitedBy: 'space' });
    expect(plan.binding).toBe('space');
  });

  it('caps a typed quantity at what the destination buy orders take', () => {
    const plan = planTrip({
      candidates: [
        instant({
          typeId: 1,
          destBuyLadder: [
            { price: 115, units: 5, orders: 1 },
            { price: 110, units: 3, orders: 1 },
          ],
        }),
      ],
      cargoM3: null,
      budgetIsk: null,
      fees: FEES,
      overrides: new Map([[1, { quantity: 500 }]]),
    });
    expect(plan.lines[0]).toMatchObject({ quantity: 8, cost: 800, limitedBy: 'edited' });
  });
});

describe('multibuyText', () => {
  it('writes one "Name Qty" line per shipped item, in the order given', () => {
    const text = multibuyText([
      { name: 'Alpha', quantity: 5 },
      { name: 'Beta', quantity: 0 },
      { name: 'Gamma', quantity: 1200 },
    ]);
    expect(text).toBe('Alpha 5\nGamma 1200');
  });

  it('is empty when nothing ships', () => {
    expect(multibuyText([{ name: 'Alpha', quantity: 0 }])).toBe('');
  });
});
