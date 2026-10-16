import { describe, expect, it } from 'vitest';
import type { CargoHold } from './cargoHolds';
import { planFill, type PlanFillInput } from './haulingFill';
import { planTrip, type TripCandidate, type TripOverride } from './haulingPlan';

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

const anyHold = (capacityM3: number): CargoHold[] => [{ kind: 'general', capacityM3 }];

function fill(over: Partial<PlanFillInput>) {
  return planFill({
    current: [],
    overrides: new Map<number, TripOverride>(),
    extras: [],
    holds: null,
    budgetIsk: null,
    fees: FEES,
    ...over,
  });
}

const quantityOf = (lines: readonly { typeId: number; quantity: number }[], typeId: number) =>
  lines.find((l) => l.typeId === typeId)?.quantity;

describe('planFill', () => {
  it('keeps the current plan as it is, even when an extra earns more per m³', () => {
    const current = [candidate({ typeId: 1, demandCapUnits: 60 })];
    // Earns far more per m³ than item 1: planned together, it would take item 1's room.
    const extras = [candidate({ typeId: 2, expectedPrice: 1_000, demandCapUnits: 500 })];
    const result = fill({ current, extras, holds: anyHold(100) });

    expect(quantityOf(result.before.lines, 1)).toBe(60);
    expect(quantityOf(result.after.lines, 1)).toBe(60);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toMatchObject({ typeId: 2, quantity: 40, volumeM3: 40 });
  });

  it('gives the extras only the ISK the current plan leaves', () => {
    const current = [candidate({ typeId: 1, demandCapUnits: 10 })]; // 1,000 ISK
    const extras = [candidate({ typeId: 2 })];
    const result = fill({ current, extras, budgetIsk: 1_500 });

    expect(result.lines[0]).toMatchObject({ typeId: 2, quantity: 5, cost: 500 });
    expect(result.after.totals.cost).toBe(1_500);
  });

  it('does not count room only an ammo hold takes as space for non-ammo extras', () => {
    const AMMO = { groupId: 85, categoryId: 8 };
    const MODULE = { groupId: 55, categoryId: 7 };
    const current = [candidate({ typeId: 1, ...MODULE, demandCapUnits: 80 })];
    const extras = [
      candidate({ typeId: 2, ...MODULE, demandCapUnits: 1000 }),
      candidate({ typeId: 3, ...AMMO, demandCapUnits: 300 }),
    ];
    const result = fill({
      current,
      extras,
      holds: [
        { kind: 'general', capacityM3: 100 },
        { kind: 'ammo', capacityM3: 500 },
      ],
    });

    // 20 m³ of general room left; the ammo hold's 500 m³ only takes the ammo.
    expect(quantityOf(result.lines, 2)).toBe(20);
    expect(quantityOf(result.lines, 3)).toBe(300);
  });

  it('ignores an extra already in the current plan, and a repeated extra', () => {
    const current = [candidate({ typeId: 1, demandCapUnits: 10 })];
    const extras = [
      candidate({ typeId: 1, expectedPrice: 1_000 }),
      candidate({ typeId: 2, demandCapUnits: 5 }),
      candidate({ typeId: 2, demandCapUnits: 5 }),
    ];
    const result = fill({ current, extras });

    expect(result.lines.map((l) => l.typeId)).toEqual([2]);
    expect(result.after.lines.map((l) => l.typeId)).toEqual([1, 2]);
    expect(quantityOf(result.after.lines, 1)).toBe(10);
  });

  it('leaves an unticked current line out, and its room to the extras', () => {
    const current = [
      candidate({ typeId: 1, demandCapUnits: 60 }),
      candidate({ typeId: 2, demandCapUnits: 30 }),
    ];
    const overrides = new Map<number, TripOverride>([[2, { selected: false }]]);
    const extras = [candidate({ typeId: 3 })];
    const result = fill({ current, overrides, extras, holds: anyHold(100) });

    expect(result.after.lines.find((l) => l.typeId === 2)).toMatchObject({
      quantity: 0,
      selected: false,
    });
    expect(quantityOf(result.lines, 3)).toBe(40);
  });

  it('keeps a current line typed to 0 at 0', () => {
    const current = [candidate({ typeId: 1 })];
    const overrides = new Map<number, TripOverride>([[1, { quantity: 0 }]]);
    const result = fill({ current, overrides, extras: [candidate({ typeId: 2 })] });

    expect(quantityOf(result.after.lines, 1)).toBe(0);
  });

  it('keeps a typed current quantity', () => {
    const current = [candidate({ typeId: 1 })];
    const overrides = new Map<number, TripOverride>([[1, { quantity: 25 }]]);
    const result = fill({
      current,
      overrides,
      extras: [candidate({ typeId: 2 })],
      holds: anyHold(100),
    });

    expect(quantityOf(result.after.lines, 1)).toBe(25);
    expect(quantityOf(result.lines, 2)).toBe(75);
  });

  it('leaves out extras that would ship nothing', () => {
    const extras = [
      candidate({ typeId: 2, expectedPrice: 90 }), // never profitable
      candidate({ typeId: 3, demandCapUnits: 0 }),
      candidate({ typeId: 4, demandCapUnits: 10 }),
    ];
    const result = fill({ extras });

    expect(result.lines.map((l) => l.typeId)).toEqual([4]);
  });

  it('lists the fill best profit per m³ first', () => {
    const extras = [
      candidate({ typeId: 2, demandCapUnits: 10, unitVolumeM3: 5 }),
      candidate({ typeId: 3, demandCapUnits: 10, unitVolumeM3: 1 }),
      candidate({ typeId: 4, demandCapUnits: 10, unitVolumeM3: 2 }),
    ];
    const result = fill({ extras });

    expect(result.lines.map((l) => l.typeId)).toEqual([3, 4, 2]);
  });

  it('adds up to the difference between the plan before and after', () => {
    const current = [
      candidate({ typeId: 1, demandCapUnits: 30 }),
      candidate({ typeId: 2, demandCapUnits: 20, unitVolumeM3: 2 }),
    ];
    const extras = [
      candidate({ typeId: 3, demandCapUnits: 10 }),
      candidate({ typeId: 4, expectedPrice: 200, unitVolumeM3: 0.5 }),
    ];
    const result = fill({ current, extras, holds: anyHold(120), budgetIsk: 9_000 });

    const sum = (key: 'volumeM3' | 'cost' | 'profit') =>
      result.lines.reduce((s, l) => s + l[key], 0);
    expect(result.added).toEqual({
      volumeM3: sum('volumeM3'),
      cost: sum('cost'),
      profit: sum('profit'),
    });
    expect(result.after.totals.volumeM3).toBeCloseTo(
      result.before.totals.volumeM3 + result.added.volumeM3
    );
    expect(result.after.totals.cost).toBeCloseTo(result.before.totals.cost + result.added.cost);
    expect(result.after.totals.profit).toBeCloseTo(
      result.before.totals.profit + result.added.profit
    );
    expect(result.after.totals.items).toBe(result.before.totals.items + result.lines.length);
  });

  it('makes `before` the current plan exactly as planTrip plans it', () => {
    const current = [candidate({ typeId: 1, demandCapUnits: 30 })];
    const overrides = new Map<number, TripOverride>();
    const result = fill({ current, overrides, extras: [candidate({ typeId: 2 })] });

    expect(result.before).toEqual(
      planTrip({ candidates: current, overrides, holds: null, budgetIsk: null, fees: FEES })
    );
  });

  it('uses a `before` it is given instead of planning the current lines again', () => {
    const current = [candidate({ typeId: 1, demandCapUnits: 60 })];
    const extras = [candidate({ typeId: 2, demandCapUnits: 500 })];
    const holds = anyHold(100);
    const planned = fill({ current, extras, holds });
    const given = fill({ current, extras, holds, before: planned.before });

    expect(given.before).toBe(planned.before);
    expect(given).toEqual(planned);
  });

  it('sizes the extras by sales alone with no Cargo Space', () => {
    const current = [candidate({ typeId: 1, demandCapUnits: 30 })];
    const extras = [candidate({ typeId: 2, demandCapUnits: 700, unitVolumeM3: 50 })];
    const result = fill({ current, extras, holds: null });

    expect(result.lines[0]).toMatchObject({ typeId: 2, quantity: 700, limitedBy: 'sales' });
  });

  it('adds nothing when there are no extras', () => {
    const result = fill({ current: [candidate({ typeId: 1 })] });

    expect(result.lines).toEqual([]);
    expect(result.added).toEqual({ volumeM3: 0, cost: 0, profit: 0 });
  });
});
