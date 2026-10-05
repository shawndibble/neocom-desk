import { describe, it, expect } from 'vitest';
import { planGoals } from './goalPlan';
import { planEconomics } from './planEconomics';
import { baselineTotal } from './baseline';
import { CUSTOMS_TAXABLE_VALUE, IMPORT_TAXABLE_FRACTION } from './chain';
import type { PlannerPolicy, PriceBooks } from './goalTypes';
import { POLICY, colony, goal, pi } from './goalPlanSteps/test-helpers';

const ROBOTICS = 9848;
const CONSUMER_ELECTRONICS = 9836;
const MECHANICAL_PARTS = 3689;
const HEAVY_METALS = 2272;
const NON_CS_CRYSTALS = 2306;
const TOXIC_METALS = 2400;
const CHIRAL_STRUCTURES = 2401;

function books(): PriceBooks {
  const price: Record<number, number> = {};
  for (const id of Object.keys(pi.schematics)) price[Number(id)] = 1000;
  price[CONSUMER_ELECTRONICS] = 5000;
  return { ask: price, bid: price, salesTaxPct: 0 };
}

const TWO_BARREN = () => [colony(1, 'barren'), colony(2, 'barren')];

function plan(buyTiers: PlannerPolicy['buyTiers'], colonies = TWO_BARREN()) {
  return planGoals(
    { goals: [goal(ROBOTICS, 0.5)], colonies, policy: { ...POLICY, buyTiers }, books: books() },
    pi
  );
}

describe('planGoals — buying P2 and P3', () => {
  // A barren colony yields neither Heavy Metals nor Non-CS Crystals, so
  // Consumer Electronics cannot be made; Mechanical Parts can.
  it('buys the P2 that cannot be made when P2 is allowed, and still makes the rest', () => {
    const result = plan([2]);
    expect(result.shortfalls).toEqual([]);
    expect(result.achieved[0].fraction).toBeCloseTo(1, 6);
    const bought = result.buys.find((b) => b.typeId === CONSUMER_ELECTRONICS);
    expect(bought?.tier).toBe(2);
    expect(bought?.unitsPerHour).toBeGreaterThan(0);
    // Robotics is made on the colony from the bought P2.
    expect(result.factoryHost).not.toBeNull();
    expect(result.flows).toContainEqual(
      expect.objectContaining({
        from: 'hub',
        to: result.factoryHost!.planetId,
        typeId: CONSUMER_ELECTRONICS,
      })
    );
  });

  it('does not extract or demand anything under the bought P2', () => {
    const result = plan([2]);
    const demanded = result.demand.map((l) => l.typeId);
    for (const id of [HEAVY_METALS, NON_CS_CRYSTALS, TOXIC_METALS, CHIRAL_STRUCTURES]) {
      expect(demanded).not.toContain(id);
    }
    const line = result.demand.find((l) => l.typeId === CONSUMER_ELECTRONICS)!;
    expect(line.source).toBe('bought');
    expect(line.madeFraction).toBe(0);
    expect(result.demand.find((l) => l.typeId === MECHANICAL_PARTS)?.source).toBe('made');
  });

  it('prices bought goods at the ask and charges import customs at the host', () => {
    const result = plan([2]);
    const colonies = TWO_BARREN();
    const economics = planEconomics(
      result,
      colonies,
      baselineTotal(colonies, pi, { ...POLICY, buyTiers: [2] }, books()),
      books()
    );
    if (economics.status !== 'costed') throw new Error('expected a priced plan');
    const units = result.buys.find((b) => b.typeId === CONSUMER_ELECTRONICS)!.unitsPerHour;
    expect(economics.buys).toBeCloseTo(units * 5000, 6);
    // Every leg into a colony pays import customs, the bought P2 among them.
    const imports = result.flows
      .filter((f) => f.to !== 'hub' && f.from !== f.to)
      .reduce(
        (sum, f) =>
          sum + f.unitsPerHour * 0.1 * CUSTOMS_TAXABLE_VALUE[f.tier] * IMPORT_TAXABLE_FRACTION,
        0
      );
    expect(economics.customs.importToHost).toBeCloseTo(imports, 6);
    expect(
      result.flows.some(
        (f) => f.from === 'hub' && f.to !== 'hub' && f.typeId === CONSUMER_ELECTRONICS
      )
    ).toBe(true);
  });

  it('hauls the bought P2 from the hub to the host, with its jumps', () => {
    const result = planGoals(
      {
        goals: [goal(ROBOTICS, 0.5)],
        colonies: TWO_BARREN(),
        policy: { ...POLICY, buyTiers: [2] },
        books: books(),
        jumps: (_from, to) => (to === 'hub' ? 7 : 0),
      },
      pi
    );
    const leg = result.flows.find((f) => f.from === 'hub' && f.typeId === CONSUMER_ELECTRONICS)!;
    expect(leg.jumps).toBeDefined();
    expect(result.hauling.m3PerWeek).toBeGreaterThan(0);
  });

  it('is unchanged when only P1 is allowed: the P1s are bought, no P2', () => {
    const result = plan([1]);
    expect(result.shortfalls).toEqual([]);
    expect(result.buys.every((b) => b.tier === 1)).toBe(true);
    expect(result.buys.map((b) => b.typeId)).toContain(TOXIC_METALS);
  });

  it('reports the shortfall and buys nothing when nothing is allowed', () => {
    const result = plan([]);
    expect(result.buys).toEqual([]);
    expect(result.shortfalls.some((s) => s.kind === 'type-gap')).toBe(true);
  });

  it('buys the P3 outright when only P3 is allowed', () => {
    const result = plan([3]);
    expect(result.buys).toEqual([
      expect.objectContaining({ typeId: ROBOTICS, tier: 3, unitsPerHour: expect.closeTo(0.5, 6) }),
    ]);
  });

  it('plans a P3 with no colonies by buying P3 outright, and says no host for P2 buying', () => {
    const outright = plan([3], []);
    expect(outright.buys.map((b) => b.typeId)).toEqual([ROBOTICS]);
    const noHost = plan([2], []);
    expect(noHost.shortfalls.some((s) => s.kind === 'no-factory-host')).toBe(true);
  });

  it('buys only the missing part of a P2 when colonies fall short of it', () => {
    // Two barren colonies reach half of 10 Mechanical Parts an hour.
    const ask = (buyTiers: PlannerPolicy['buyTiers']) =>
      planGoals(
        {
          goals: [goal(MECHANICAL_PARTS, 10)],
          colonies: TWO_BARREN(),
          policy: { ...POLICY, buyTiers },
          books: books(),
        },
        pi
      );
    expect(ask([]).achieved[0].fraction).toBeLessThan(1);
    const result = ask([2]);
    expect(result.achieved[0].fraction).toBeCloseTo(1, 6);
    const bought = result.buys.find((b) => b.typeId === MECHANICAL_PARTS)!;
    expect(bought.tier).toBe(2);
    expect(bought.unitsPerHour).toBeGreaterThan(0);
    expect(bought.unitsPerHour).toBeLessThan(10);
    const line = result.demand.find((l) => l.typeId === MECHANICAL_PARTS)!;
    expect(line.source).toBe('bought');
    expect(line.madeFraction).toBeGreaterThan(0);
    expect(line.madeFraction).toBeLessThan(1);
  });
});
