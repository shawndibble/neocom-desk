import { describe, it, expect } from 'vitest';
import { achievedOf, demandLines } from './demand';
import { extractionProblem, solveExtraction } from './extraction';
import { findGaps } from './shortfalls';
import { triageGoals } from './triage';
import { BASE_METALS, POLICY, REACTIVE_METALS, colony, goal, pi } from './test-helpers';
import type { Goal, PlannerColony, PlannerPolicy } from '../goalTypes';

/** Steps 1–6 for P1 goals only (no host), then the demand lines and achievement. */
function run(goals: Goal[], colonies: PlannerColony[], policy: PlannerPolicy = POLICY) {
  const triage = triageGoals(goals, colonies, policy, pi);
  const dead = new Set<Goal>(triage.blocked);
  const boughtOutright = new Set<Goal>();
  const problem = extractionProblem({
    planned: goals.filter((g) => !dead.has(g)),
    colonies,
    policy,
    pi,
    host: null,
    hostFactories: {},
  });
  const solved = solveExtraction(problem);
  const gaps = findGaps(problem, solved.wants, solved.extracted);
  const lines = demandLines({
    problem,
    extracted: solved.extracted,
    consumption: solved.consumption,
    budgetGapP1: gaps.budgetGapP1,
    bought: gaps.bought,
    madeHighRates: new Map(),
    triage,
    dead,
    boughtOutright,
    pi,
  });
  const achieved = achievedOf({
    goals,
    dead,
    boughtOutright,
    highFraction: solved.highFraction,
    p1GoalReach: solved.p1GoalReach,
    pi,
  });
  return { lines, achieved };
}

describe('demandLines', () => {
  it('marks a budget-gapped P1 and its P0 short, with the share actually made', () => {
    // Two ECUs make 72 of the 120 Reactive Metals/h asked.
    const { lines, achieved } = run([goal(REACTIVE_METALS, 120)], [colony(1, 'barren')]);
    expect(lines).toMatchObject([
      { typeId: REACTIVE_METALS, tier: 1, source: 'short', madeFraction: expect.closeTo(0.6, 6) },
      { typeId: BASE_METALS, tier: 0, source: 'short', madeFraction: expect.closeTo(0.6, 6) },
    ]);
    expect(achieved).toEqual([
      { typeId: REACTIVE_METALS, unitsPerHour: expect.closeTo(72, 6), fraction: 0.6 },
    ]);
  });

  it('labels a P1 the pilot buys as bought, and its P0 as extracted for the part extracted', () => {
    const { lines } = run([goal(REACTIVE_METALS, 120)], [colony(1, 'barren')], {
      ...POLICY,
      buyTiers: [1],
    });
    expect(lines.map((l) => [l.typeId, l.source])).toEqual([
      [REACTIVE_METALS, 'bought'],
      [BASE_METALS, 'extracted'],
    ]);
  });

  it('keeps a type-gap-blocked goal’s chain as blocked lines naming the missing P0', () => {
    const { lines, achieved } = run([goal(REACTIVE_METALS, 40)], [colony(1, 'temperate')]);
    expect(lines).toEqual([
      expect.objectContaining({
        typeId: REACTIVE_METALS,
        source: 'blocked',
        madeFraction: 0,
        blockedBy: [BASE_METALS],
      }),
      expect.objectContaining({ typeId: BASE_METALS, source: 'blocked', blockedBy: [BASE_METALS] }),
    ]);
    expect(achieved).toEqual([{ typeId: REACTIVE_METALS, unitsPerHour: 0, fraction: 0 }]);
  });
});
