import { describe, it, expect } from 'vitest';
import { optimizeForMe } from '@/engine/optimizer/optimizeForMe';
import { suggestReorder, isValidOrder } from '@/engine/optimizer/reorderSuggestion';
import { placeRemaps } from '@/engine/optimizer/placeRemaps';
import type {
  AttributeName,
  Attributes,
  EngineSkill,
  PlanPriority,
  PlanStep,
} from '@/engine/types';

const skill = (
  typeID: number,
  primary: AttributeName,
  secondary: AttributeName,
  prereqs: { typeID: number; level: number }[] = []
): EngineSkill => ({ typeID, name: `Skill ${typeID}`, rank: 1, primary, secondary, prereqs });

const skillMap = (...list: EngineSkill[]): Map<number, EngineSkill> =>
  new Map(list.map((s) => [s.typeID, s]));

const step = (skillTypeID: number, level: number): PlanStep => ({ skillTypeID, level });

const levels = (skillTypeID: number, upTo: number): PlanStep[] =>
  Array.from({ length: upTo }, (_, i) => ({ skillTypeID, level: i + 1 }));

const CURRENT: Attributes = {
  intelligence: 20,
  memory: 20,
  perception: 20,
  willpower: 20,
  charisma: 19,
};

describe('optimizeForMe', () => {
  it('composes suggestReorder and placeRemaps on the reordered steps', () => {
    const skills = skillMap(
      skill(1, 'perception', 'willpower'),
      skill(2, 'intelligence', 'memory'),
      skill(3, 'perception', 'willpower')
    );
    const steps = [step(1, 1), step(2, 1), step(3, 1), step(2, 2)];
    const options = { remapCount: 2, currentAttributes: CURRENT };

    const result = optimizeForMe(steps, skills, options);
    const expectedOrder = suggestReorder(steps, skills);

    expect(result.order).toEqual(expectedOrder);
    expect(result.remaps).toEqual(placeRemaps(expectedOrder, skills, options));
  });

  it('keeps high-priority steps ahead of normal ones regardless of remap gain', () => {
    const skills = skillMap(
      skill(1, 'perception', 'willpower'),
      skill(2, 'intelligence', 'memory')
    );
    const steps = [...levels(1, 3), ...levels(2, 3)];
    const priorities = new Map<number, PlanPriority>([[2, 'high']]);
    const options = { remapCount: 2, currentAttributes: CURRENT };

    const result = optimizeForMe(steps, skills, options, priorities);

    expect(result.order[0].skillTypeID).toBe(2);
    expect(isValidOrder(result.order, skills)).toBe(true);
  });

  it('returns a valid permutation of the input steps', () => {
    const skills = skillMap(
      skill(1, 'perception', 'willpower'),
      skill(2, 'intelligence', 'memory', [{ typeID: 1, level: 3 }])
    );
    const steps = [...levels(1, 3), ...levels(2, 2)];
    const result = optimizeForMe(steps, skills, { remapCount: 1, currentAttributes: CURRENT });

    expect(isValidOrder(result.order, skills)).toBe(true);
  });

  it('remapCount 0 reorders only: one current-attributes segment, no remap gain', () => {
    const skills = skillMap(
      skill(1, 'perception', 'willpower'),
      skill(2, 'intelligence', 'memory')
    );
    const steps = [...levels(1, 3), ...levels(2, 3)];
    const result = optimizeForMe(steps, skills, { remapCount: 0, currentAttributes: CURRENT });

    expect(result.remaps.segments).toHaveLength(1);
    expect(result.remaps.segments[0].remap).toBe(false);
    expect(result.remaps.savingsSeconds).toBe(0);
  });

  it('total seconds is at most as good as reorder-only or remaps-only alone', () => {
    const skills = skillMap(
      skill(1, 'perception', 'willpower'),
      skill(2, 'intelligence', 'memory'),
      skill(3, 'perception', 'willpower')
    );
    // Mixed attribute pairs, interleaved: reordering groups them, and
    // remapping on the grouped order should never cost more than remapping
    // on the original (fragmented) order.
    const steps = [
      step(1, 1),
      step(2, 1),
      step(3, 1),
      step(1, 2),
      step(2, 2),
      step(3, 2),
      step(1, 3),
      step(2, 3),
    ];
    const options = { remapCount: 2, currentAttributes: CURRENT };

    const combined = optimizeForMe(steps, skills, options);
    const reorderOnly = placeRemaps(suggestReorder(steps, skills), skills, {
      remapCount: 0,
      currentAttributes: CURRENT,
    });
    const remapsOnly = placeRemaps(steps, skills, options);

    expect(combined.remaps.totalSeconds).toBeLessThanOrEqual(reorderOnly.totalSeconds);
    expect(combined.remaps.totalSeconds).toBeLessThanOrEqual(remapsOnly.totalSeconds);
  });
});
