import { describe, it, expect } from 'vitest';
import type { ColonyAssignment, ExtractionSlot, GoalPlan, PlannerColony } from './goalTypes';
import { planDiff } from './planDiff';

const BASE_METALS = 2267;
const NOBLE_METALS = 2270;
const HEAVY_METALS = 2272;

function colony(planetId: number, current: number[]): PlannerColony {
  return {
    planetId,
    planetType: 'barren',
    budget: { cpu: 0, powergrid: 0 },
    newLinkCost: { cpu: 0, powergrid: 0 },
    headsPerExtractor: 10,
    taxRate: 0.1,
    ratePerEcu: new Map(),
    current: { p0TypeIds: current, productTypeIds: [] },
  };
}

function slot(p0TypeId: number): ExtractionSlot {
  return {
    p0TypeId,
    p1TypeId: 0,
    ecus: 1,
    p0PerHour: 6000,
    p1PerHour: 40,
    basicFactories: 1,
    rateSource: 'assumed',
  };
}

function assignment(
  planetId: number,
  role: ColonyAssignment['role'],
  p0s: number[] = []
): ColonyAssignment {
  return {
    planetId,
    role,
    slots: p0s.map(slot),
    factories: role === 'factory' ? { advanced: 2 } : {},
    pins: {},
    used: { cpu: 0, powergrid: 0 },
    budget: { cpu: 0, powergrid: 0 },
    limitedBy: [],
  };
}

function planOf(assignments: ColonyAssignment[]): GoalPlan {
  return {
    goals: [],
    achieved: [],
    demand: [],
    assignments,
    factoryHost: null,
    shortfalls: [],
    buys: [],
    surplusP1: [],
    flows: [],
    haulEffort: { m3JumpsPerHour: 0, unknownLegs: 0 },
    hauling: { m3PerWeek: 0, perColony: new Map() },
  };
}

describe('planDiff', () => {
  it('keeps a colony already extracting what the plan wants, in any order', () => {
    const changes = planDiff(planOf([assignment(1, 'extract', [NOBLE_METALS, BASE_METALS])]), [
      colony(1, [BASE_METALS, NOBLE_METALS]),
    ]);
    expect(changes).toEqual([
      { verb: 'keep', planetId: 1, p0TypeIds: [BASE_METALS, NOBLE_METALS] },
    ]);
  });

  it('re-targets a colony onto a different P0', () => {
    const changes = planDiff(planOf([assignment(1, 'extract', [NOBLE_METALS])]), [
      colony(1, [BASE_METALS]),
    ]);
    expect(changes).toEqual([
      { verb: 'retarget', planetId: 1, from: [BASE_METALS], to: [NOBLE_METALS] },
    ]);
  });

  it('re-targets from nothing when the colony extracts nothing today', () => {
    const changes = planDiff(planOf([assignment(1, 'extract', [BASE_METALS])]), [colony(1, [])]);
    expect(changes).toEqual([{ verb: 'retarget', planetId: 1, from: [], to: [BASE_METALS] }]);
  });

  it('adds an extractor when the plan keeps today’s P0 and puts a second beside it', () => {
    const changes = planDiff(planOf([assignment(1, 'extract', [BASE_METALS, HEAVY_METALS])]), [
      colony(1, [BASE_METALS]),
    ]);
    expect(changes).toEqual([
      { verb: 'add-extractor', planetId: 1, keep: [BASE_METALS], add: [HEAVY_METALS] },
    ]);
  });

  it('converts the factory host, naming what it stops extracting', () => {
    const changes = planDiff(planOf([assignment(1, 'factory')]), [colony(1, [BASE_METALS])]);
    expect(changes).toEqual([
      { verb: 'convert-to-factory', planetId: 1, from: [BASE_METALS], factories: { advanced: 2 } },
    ]);
  });

  it('keeps a colony the plan does not need, saying so', () => {
    const changes = planDiff(planOf([assignment(1, 'baseline', [NOBLE_METALS])]), [
      colony(1, [BASE_METALS]),
    ]);
    expect(changes).toEqual([
      { verb: 'keep', planetId: 1, p0TypeIds: [BASE_METALS], notNeeded: true },
    ]);
  });

  it('idles a colony the plan does not use, by planet id', () => {
    const changes = planDiff(planOf([assignment(2, 'idle'), assignment(1, 'idle')]), [
      colony(1, [BASE_METALS]),
      colony(2, []),
    ]);
    expect(changes).toEqual([
      { verb: 'idle', planetId: 1, from: [BASE_METALS] },
      { verb: 'idle', planetId: 2, from: [] },
    ]);
  });
});
