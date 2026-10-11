import { describe, expect, it } from 'vitest';
import { evaluateFitGoal, fittingNeededSkills } from './fitGoal';
import type { Fitting } from '@/engine/fittings/types';
import type { PlanStep } from '@/engine/types';

const hullOnly: Fitting = { name: 'Hull', shipTypeId: 1, modules: [], drones: [], cargo: [] };

const requirements = new Map([
  [1, [{ skillTypeID: 100, level: 3 }]],
  [10, [{ skillTypeID: 200, level: 4 }]],
  [40, [{ skillTypeID: 300, level: 2 }]],
  [50, [{ skillTypeID: 400, level: 1 }]],
]);

function steps(...pairs: [number, number][]): PlanStep[] {
  return pairs.map(([skillTypeID, level]) => ({ skillTypeID, level }));
}

describe('fittingNeededSkills', () => {
  it('lists the hull skill for a hull-only fit', () => {
    expect(fittingNeededSkills(hullOnly, requirements)).toEqual([
      { skillTypeID: 100, targetLevel: 3 },
    ]);
  });

  it('covers modules, charges, drones and fighters at their highest level', () => {
    const fit: Fitting = {
      ...hullOnly,
      modules: [{ slot: 'high', slotIndex: 0, typeId: 10, state: 'active' }],
      drones: [{ typeId: 40, quantity: 1, state: 'active' }],
      fighters: [{ typeId: 50, quantity: 1, state: 'active' }],
    };
    const needed = fittingNeededSkills(fit, requirements);
    expect(needed).toEqual(
      expect.arrayContaining([
        { skillTypeID: 100, targetLevel: 3 },
        { skillTypeID: 200, targetLevel: 4 },
        { skillTypeID: 300, targetLevel: 2 },
        { skillTypeID: 400, targetLevel: 1 },
      ])
    );
    expect(needed).toHaveLength(4);
  });
});

describe('evaluateFitGoal', () => {
  const needed = [
    { skillTypeID: 100, targetLevel: 3 },
    { skillTypeID: 200, targetLevel: 4 },
  ];

  it('is flyable now with nothing to anchor when every level is trained', () => {
    const trained = new Map([
      [100, 3],
      [200, 5],
    ]);
    expect(evaluateFitGoal(needed, trained, [])).toEqual({
      state: 'flyable-now',
      anchor: null,
      missing: [],
      missingLevels: 0,
    });
  });

  it('anchors to the latest needed step in training order', () => {
    const plan = steps([200, 4], [100, 3]);
    const result = evaluateFitGoal(needed, new Map(), plan);
    expect(result.state).toBe('in-plan');
    expect(result.anchor).toEqual({ skillTypeID: 100, level: 3 });
    const reversed = evaluateFitGoal(needed, new Map(), steps([100, 3], [200, 4]));
    expect(reversed.anchor).toEqual({ skillTypeID: 200, level: 4 });
  });

  it('ignores trained levels when anchoring', () => {
    const result = evaluateFitGoal(needed, new Map([[100, 3]]), steps([200, 4]));
    expect(result.anchor).toEqual({ skillTypeID: 200, level: 4 });
  });

  it('reports levels the plan does not reach, with the entries to add', () => {
    const result = evaluateFitGoal(needed, new Map([[200, 2]]), steps([100, 3]));
    expect(result.state).toBe('missing');
    expect(result.anchor).toBeNull();
    expect(result.missing).toEqual([{ skillTypeID: 200, targetLevel: 4 }]);
    expect(result.missingLevels).toBe(2);
  });

  it('counts a plan that stops short of the needed level as missing', () => {
    const result = evaluateFitGoal(needed, new Map(), steps([100, 3], [200, 1], [200, 2]));
    expect(result.missing).toEqual([{ skillTypeID: 200, targetLevel: 4 }]);
    expect(result.missingLevels).toBe(2);
  });
});
