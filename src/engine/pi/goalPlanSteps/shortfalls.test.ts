import { describe, it, expect } from 'vitest';
import { extractionProblem, fill, release, solveExtraction } from './extraction';
import { compareShortfalls, findGaps } from './shortfalls';
import { BASE_METALS, POLICY, REACTIVE_METALS, colony, goal, pi } from './test-helpers';
import type { PlannerColony, PlannerPolicy, Shortfall } from '../goalTypes';

function solve(perHour: number, colonies: PlannerColony[], policy: PlannerPolicy = POLICY) {
  const problem = extractionProblem({
    planned: [goal(REACTIVE_METALS, perHour)],
    colonies,
    policy,
    pi,
    host: null,
    hostFactories: {},
  });
  return { problem, solved: solveExtraction(problem) };
}

describe('fill and release', () => {
  it('adds the fewest ECUs that cover the rate, and release shrinks back to what is consumed', () => {
    // One ECU at 6000 P0/h makes 40 Reactive Metals/h; two make 72.
    const { problem } = solve(60, [colony(1, 'barren')]);
    const state = new Map();
    expect(fill(problem, state, problem.rows[0], 60)).toBeCloseTo(72, 6);
    expect(state.get(1)).toEqual([{ p0TypeId: BASE_METALS, ecus: 2 }]);
    release(problem, state, new Map([[REACTIVE_METALS, 40]]));
    expect(state.get(1)).toEqual([{ p0TypeId: BASE_METALS, ecus: 1 }]);
    release(problem, state, new Map());
    expect(state.has(1)).toBe(false);
  });
});

describe('findGaps', () => {
  it('calls a budget gap when every colony that yields it is full', () => {
    const { problem, solved } = solve(120, [colony(1, 'barren')]);
    const gaps = findGaps(problem, solved.wants, solved.extracted);
    expect(gaps.bought.size).toBe(0);
    expect([...gaps.budgetGapP1]).toEqual([REACTIVE_METALS]);
    expect(gaps.shortfalls).toEqual([
      {
        kind: 'budget-gap',
        p0TypeId: BASE_METALS,
        p1TypeId: REACTIVE_METALS,
        unitsPerHour: expect.closeTo(48 * 150, 6),
        p1UnitsPerHour: expect.closeTo(48, 6),
        retargetCandidates: [],
      },
    ]);
  });

  it('buys the unmet P1 instead of calling a gap when the pilot buys P1', () => {
    const { problem, solved } = solve(120, [colony(1, 'barren')], { ...POLICY, buyTiers: [1] });
    const gaps = findGaps(problem, solved.wants, solved.extracted);
    expect(gaps.shortfalls).toEqual([]);
    expect(gaps.bought.get(REACTIVE_METALS)).toBeCloseTo(48, 6);
  });
});

describe('compareShortfalls', () => {
  it('orders host problems before type gaps before budget gaps, then by P0', () => {
    const typeGap = (p0TypeId: number): Shortfall => ({
      kind: 'type-gap',
      p0TypeId,
      p1TypeId: 0,
      unitsPerHour: 1,
      p1UnitsPerHour: 1,
      fixPlanetTypes: [],
    });
    const budget: Shortfall = {
      kind: 'budget-gap',
      p0TypeId: 1,
      p1TypeId: 0,
      unitsPerHour: 1,
      p1UnitsPerHour: 1,
      retargetCandidates: [],
    };
    const noHost: Shortfall = { kind: 'no-factory-host', facility: 'highTech' };
    const over: Shortfall = { kind: 'host-over-budget', planetId: 1, limitedBy: ['cpu'] };
    expect([budget, typeGap(9), over, typeGap(3), noHost].sort(compareShortfalls)).toEqual([
      noHost,
      over,
      typeGap(3),
      typeGap(9),
      budget,
    ]);
  });
});
