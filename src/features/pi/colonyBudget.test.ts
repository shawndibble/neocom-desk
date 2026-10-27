import { describe, it, expect } from 'vitest';
import { piFixture } from '@/sde/__fixtures__/pi';
import { colonyBudget, maxColonyBudget } from './colonyBudget';

const pi = piFixture();

describe('colonyBudget', () => {
  it("reads the row for the colony's own Command Center upgrade level", () => {
    expect(colonyBudget(4, pi)).toEqual({
      level: 4,
      budget: { cpu: 21_315, powergrid: 17_000 },
    });
  });

  it('has nothing to hedge, because the level is measured', () => {
    // A built colony's `upgrade_level` comes straight from ESI, so unlike the
    // skill-derived ceiling there is no unknown case to flag.
    expect(colonyBudget(0, pi)).toEqual({ level: 0, budget: { cpu: 1_675, powergrid: 6_000 } });
  });

  it('clamps a level past the table rather than coming back with nothing', () => {
    expect(colonyBudget(9, pi).level).toBe(5);
    expect(colonyBudget(-2, pi).level).toBe(0);
  });

  it('never reads the budget off the skill, which would overstate an un-upgraded colony', () => {
    // The regression this guards: a pilot at Command Center Upgrades V with a
    // colony still at upgrade level 1 has 9,000 MW there, not 19,000. Sizing
    // that colony off the skill would promise more than twice the headroom.
    const atColonyLevel = colonyBudget(1, pi);
    const atSkillCeiling = maxColonyBudget(5, pi);
    expect(atColonyLevel.budget.powergrid).toBe(9_000);
    expect(atSkillCeiling.budget.powergrid).toBe(19_000);
    expect(atColonyLevel.budget.powergrid).toBeLessThan(atSkillCeiling.budget.powergrid);
  });
});

describe('maxColonyBudget', () => {
  it('reports the ceiling the trained skill allows', () => {
    expect(maxColonyBudget(4, pi)).toEqual({
      level: 4,
      assumed: false,
      budget: { cpu: 21_315, powergrid: 17_000 },
    });
  });

  it('falls back to untrained when there is no skill data, and says so', () => {
    expect(maxColonyBudget(null, pi)).toEqual({
      level: 0,
      assumed: true,
      budget: { cpu: 1_675, powergrid: 6_000 },
    });
  });

  it('keeps a confident zero distinct from no data', () => {
    expect(maxColonyBudget(0, pi).assumed).toBe(false);
  });
});
