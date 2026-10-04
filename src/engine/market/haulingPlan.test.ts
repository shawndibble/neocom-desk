import { describe, expect, it } from 'vitest';
import type { CargoHold } from './cargoHolds';
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

/** One hold of the given size that takes anything. */
const anyHold = (capacityM3: number): CargoHold[] => [{ kind: 'general', capacityM3 }];

describe('planTrip', () => {
  it('caps a load at a week of sales when nothing else binds', () => {
    const plan = planTrip({
      candidates: [candidate({ typeId: 1, demandCapUnits: 40 })],
      holds: null,
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
      holds: null,
      budgetIsk: null,
      fees: FEES,
      overrides: NO_OVERRIDES,
    });
    expect(plan.lines[0]).toMatchObject({ quantity: 10, limitedBy: 'supply' });
  });

  it('stops at the hold and says space was the limit', () => {
    const plan = planTrip({
      candidates: [candidate({ typeId: 1, unitVolumeM3: 10 })],
      holds: anyHold(250),
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
      holds: anyHold(10_000),
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
      holds: anyHold(100),
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
      holds: anyHold(60),
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
      holds: anyHold(100),
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
      holds: null,
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

describe('planTrip, a lane chosen per item', () => {
  it("prices a candidate at its own destination's fees when it carries them", () => {
    // Break-even at 150 x (1 - fees): with poor standing the broker fee eats the
    // 141-ISK level, with good standing it stays profitable.
    const ladder = [
      { price: 100, units: 10, orders: 1 },
      { price: 141, units: 10, orders: 1 },
    ];
    const good = { ...FEES, standing: { factionStanding: 10, corpStanding: 10 } };
    const plan = planTrip({
      candidates: [
        candidate({ typeId: 1, expectedPrice: 150, buyLadder: ladder }),
        candidate({ typeId: 2, expectedPrice: 150, buyLadder: ladder, fees: good }),
      ],
      holds: null,
      budgetIsk: null,
      fees: { ...FEES, brokerRelationsLevel: 0 },
      overrides: NO_OVERRIDES,
    });
    expect(plan.lines[0]!.quantity).toBe(10);
    expect(plan.lines[1]!.quantity).toBe(20);
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
      holds: null,
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
      holds: anyHold(20),
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
      holds: null,
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

describe('planTrip with specialised holds', () => {
  const AMMO = { groupId: 85, categoryId: 8 };
  const MODULE = { groupId: 55, categoryId: 7 };
  const P0 = { groupId: 1032, categoryId: 42 };
  const P1 = { groupId: 1042, categoryId: 43 };
  const FUEL_BLOCK = { groupId: 1136, categoryId: 4 };
  const ICE_PRODUCT = { groupId: 423, categoryId: 4 };

  function plan(
    candidates: TripCandidate[],
    holds: CargoHold[] | null,
    overrides: Map<number, { quantity?: number; selected?: boolean }> = NO_OVERRIDES
  ) {
    return planTrip({ candidates, holds, budgetIsk: null, fees: FEES, overrides });
  }

  it('fills an ammo hold with ammo before the cargo hold', () => {
    const result = plan(
      [candidate({ typeId: 1, ...AMMO, unitVolumeM3: 0.01, demandCapUnits: 1_000_000 })],
      [
        { kind: 'general', capacityM3: 300 },
        { kind: 'ammo', capacityM3: 41_000 },
      ]
    );
    // 100,000 units on the ladder at 0.01 m³ = 1,000 m³: all in the ammo hold.
    expect(result.lines[0]).toMatchObject({ quantity: 100_000, placements: [{ kind: 'ammo' }] });
    expect(result.holds).toEqual([
      { kind: 'general', capacityM3: 300, usedM3: 0 },
      { kind: 'ammo', capacityM3: 41_000, usedM3: 1_000 },
    ]);
  });

  it('spills ammo into the general hold once the ammo hold is full', () => {
    const result = plan(
      [candidate({ typeId: 1, ...AMMO, unitVolumeM3: 1, demandCapUnits: 1_000 })],
      [
        { kind: 'general', capacityM3: 300 },
        { kind: 'ammo', capacityM3: 500 },
      ]
    );
    expect(result.lines[0]).toMatchObject({
      quantity: 800,
      limitedBy: 'space',
      placements: [
        { kind: 'ammo', quantity: 500, volumeM3: 500 },
        { kind: 'general', quantity: 300, volumeM3: 300 },
      ],
    });
    expect(result.holds.map((h) => h.usedM3)).toEqual([300, 500]);
  });

  it('never puts an item a specialised hold does not accept into it', () => {
    const result = plan(
      [candidate({ typeId: 1, ...MODULE, demandCapUnits: 1_000 })],
      [
        { kind: 'general', capacityM3: 300 },
        { kind: 'ammo', capacityM3: 41_000 },
      ]
    );
    expect(result.lines[0]).toMatchObject({
      quantity: 300,
      limitedBy: 'space',
      placements: [{ kind: 'general', quantity: 300 }],
    });
    expect(result.holds[1]!.usedM3).toBe(0);
  });

  it('treats an item of unknown group as general-hold only', () => {
    const result = plan(
      [candidate({ typeId: 1, demandCapUnits: 1_000 })],
      [{ kind: 'ammo', capacityM3: 41_000 }]
    );
    expect(result.lines[0]).toMatchObject({ quantity: 0, limitedBy: 'space', placements: [] });
  });

  it('reserves specialised space first for a typed quantity', () => {
    const result = plan(
      [
        candidate({ typeId: 1, ...AMMO, demandCapUnits: 1_000 }),
        candidate({ typeId: 2, ...AMMO, demandCapUnits: 1_000 }),
      ],
      [
        { kind: 'general', capacityM3: 300 },
        { kind: 'ammo', capacityM3: 500 },
      ],
      new Map([[1, { quantity: 400 }]])
    );
    expect(result.lines[0]).toMatchObject({
      quantity: 400,
      limitedBy: 'edited',
      placements: [{ kind: 'ammo', quantity: 400 }],
    });
    expect(result.lines[1]).toMatchObject({
      quantity: 400,
      placements: [
        { kind: 'ammo', quantity: 100 },
        { kind: 'general', quantity: 300 },
      ],
    });
  });

  it('keeps a typed quantity that overflows every hold, over-filling the last one it may use', () => {
    const result = plan(
      [candidate({ typeId: 1, ...AMMO })],
      [
        { kind: 'general', capacityM3: 300 },
        { kind: 'ammo', capacityM3: 500 },
      ],
      new Map([[1, { quantity: 1_000 }]])
    );
    expect(result.lines[0]!.quantity).toBe(1_000);
    expect(result.holds.map((h) => h.usedM3)).toEqual([500, 500]);
  });

  it('still means no space limit with null or no holds', () => {
    for (const holds of [null, []]) {
      const result = plan([candidate({ typeId: 1, ...AMMO, demandCapUnits: 40 })], holds);
      expect(result.lines[0]).toMatchObject({ quantity: 40, limitedBy: 'sales', placements: [] });
      expect(result.holds).toEqual([]);
    }
  });

  it('sizes a Hoarder on an ammunition scan against its ammo hold plus its cargo hold', () => {
    const hoarder: CargoHold[] = [
      { kind: 'general', capacityM3: 300 },
      { kind: 'gas', capacityM3: 5_000 },
      { kind: 'ammo', capacityM3: 41_000 },
    ];
    const result = plan(
      [candidate({ typeId: 1, ...AMMO, unitVolumeM3: 1, demandCapUnits: 100_000 })],
      hoarder
    );
    expect(result.lines[0]).toMatchObject({ quantity: 41_300, limitedBy: 'space' });
    // The gas hold takes no ammo: it shows empty, not as spare room.
    expect(result.holds.find((h) => h.kind === 'gas')!.usedM3).toBe(0);
  });

  it('loads planetary commodities into an Epithal-style PI hold', () => {
    const result = plan(
      [candidate({ typeId: 1, ...P1, unitVolumeM3: 0.38, demandCapUnits: 10_000 })],
      [
        { kind: 'general', capacityM3: 400 },
        { kind: 'commandCenter', capacityM3: 1_000 },
        { kind: 'planetary', capacityM3: 22_000 },
      ]
    );
    expect(result.lines[0]!.placements).toEqual([
      { kind: 'planetary', quantity: 10_000, volumeM3: 3_800 },
    ]);
  });

  it('uses a Squall-style infrastructure hold for fuel blocks and P1, but not raw P0', () => {
    const squall: CargoHold[] = [
      { kind: 'general', capacityM3: 100 },
      { kind: 'infrastructure', capacityM3: 10_000 },
    ];
    const result = plan(
      [
        candidate({ typeId: 1, ...FUEL_BLOCK, unitVolumeM3: 5, demandCapUnits: 100 }),
        candidate({ typeId: 2, ...P1, unitVolumeM3: 0.38, demandCapUnits: 100 }),
        candidate({ typeId: 3, ...P0, unitVolumeM3: 0.01, demandCapUnits: 100 }),
      ],
      squall
    );
    expect(result.lines.map((l) => l.placements.map((p) => p.kind))).toEqual([
      ['infrastructure'],
      ['infrastructure'],
      ['general'],
    ]);
  });

  it('fills the narrowest of two accepting holds first: a fuel bay before an infrastructure hold', () => {
    const result = plan(
      [candidate({ typeId: 1, ...ICE_PRODUCT, unitVolumeM3: 1, demandCapUnits: 100 })],
      [
        { kind: 'infrastructure', capacityM3: 10_000 },
        { kind: 'fuel', capacityM3: 60 },
      ]
    );
    expect(result.lines[0]!.placements).toEqual([
      { kind: 'fuel', quantity: 60, volumeM3: 60 },
      { kind: 'infrastructure', quantity: 40, volumeM3: 40 },
    ]);
  });
});
