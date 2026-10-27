import { describe, it, expect } from 'vitest';
import { extractionProblem, fill, release, solveExtraction } from './extraction';
import { BASE_METALS, POLICY, REACTIVE_METALS, colony, goal, pi } from './test-helpers';
import type { PlannerColony } from '../goalTypes';

function problemFor(perHour: number, colonies: PlannerColony[]) {
  return extractionProblem({
    planned: [goal(REACTIVE_METALS, perHour)],
    colonies,
    policy: POLICY,
    pi,
    host: null,
    hostFactories: {},
  });
}

describe('fill and release', () => {
  it('adds the fewest ECUs that cover the rate, and release shrinks back to what is consumed', () => {
    // One ECU at 6000 P0/h makes 40 Reactive Metals/h; two make 72.
    const problem = problemFor(60, [colony(1, 'barren')]);
    const state = new Map();
    expect(fill(problem, state, problem.rows[0], 60)).toBeCloseTo(72, 6);
    expect(state.get(1)).toEqual([{ p0TypeId: BASE_METALS, ecus: 2 }]);
    release(problem, state, new Map([[REACTIVE_METALS, 40]]));
    expect(state.get(1)).toEqual([{ p0TypeId: BASE_METALS, ecus: 1 }]);
    release(problem, state, new Map());
    expect(state.has(1)).toBe(false);
  });
});

describe('solveExtraction', () => {
  it('fills to the ECU cap and reports what the goal reaches', () => {
    const solved = solveExtraction(problemFor(120, [colony(1, 'barren')]));
    expect(solved.wants.get(1)).toEqual([{ p0TypeId: BASE_METALS, ecus: 2 }]);
    expect(solved.extracted.get(REACTIVE_METALS)).toBeCloseTo(72, 6);
    expect(solved.p1GoalReach.get(REACTIVE_METALS)).toBeCloseTo(72, 6);
    expect(solved.binding.has(REACTIVE_METALS)).toBe(true);
  });
});
