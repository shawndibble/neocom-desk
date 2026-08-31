import { describe, it, expect } from 'vitest';
import { isValidOrder, suggestReorder } from '@/engine/optimizer/reorderSuggestion';
import type { AttributeName, EngineSkill, PlanStep, SkillPrereq } from '@/engine/types';

const skill = (
  typeID: number,
  primary: AttributeName,
  secondary: AttributeName,
  prereqs: SkillPrereq[] = [],
  rank = 1
): EngineSkill => ({ typeID, name: `Skill ${typeID}`, rank, primary, secondary, prereqs });

const skillMap = (...list: EngineSkill[]): Map<number, EngineSkill> =>
  new Map(list.map((s) => [s.typeID, s]));

const step = (skillTypeID: number, level: number): PlanStep => ({ skillTypeID, level });

const sortedKey = (steps: readonly PlanStep[]): string =>
  steps
    .map((s) => `${s.skillTypeID}:${s.level}`)
    .sort()
    .join(',');

describe('isValidOrder', () => {
  const skills = skillMap(
    skill(1, 'perception', 'willpower'),
    skill(2, 'intelligence', 'memory', [{ typeID: 1, level: 2 }])
  );

  it('accepts an order that satisfies prereqs and level order', () => {
    expect(isValidOrder([step(1, 1), step(1, 2), step(2, 1)], skills)).toBe(true);
  });

  it('rejects a step before its prerequisite level in the plan', () => {
    expect(isValidOrder([step(1, 1), step(2, 1), step(1, 2)], skills)).toBe(false);
  });

  it('rejects descending levels of the same skill', () => {
    expect(isValidOrder([step(1, 2), step(1, 1)], skills)).toBe(false);
  });

  it('treats prereq levels missing from the plan as already trained', () => {
    expect(isValidOrder([step(2, 1)], skills)).toBe(true);
  });
});

describe('suggestReorder', () => {
  it('returns empty and single-step plans unchanged', () => {
    const skills = skillMap(skill(1, 'perception', 'willpower'));
    expect(suggestReorder([], skills)).toEqual([]);
    expect(suggestReorder([step(1, 1)], skills)).toEqual([step(1, 1)]);
  });

  it('groups steps by attribute pair, keeping first-occurrence group order', () => {
    const skills = skillMap(
      skill(1, 'perception', 'willpower'),
      skill(2, 'intelligence', 'memory'),
      skill(3, 'perception', 'willpower')
    );
    const steps = [step(1, 1), step(2, 1), step(3, 1), step(2, 2)];
    const result = suggestReorder(steps, skills);
    expect(result).toEqual([step(1, 1), step(3, 1), step(2, 1), step(2, 2)]);
  });

  it('is stable: preserves original relative order within a group', () => {
    const skills = skillMap(
      skill(1, 'perception', 'willpower'),
      skill(2, 'perception', 'willpower'),
      skill(3, 'intelligence', 'memory')
    );
    const steps = [step(2, 1), step(3, 1), step(1, 1), step(2, 2)];
    const result = suggestReorder(steps, skills);
    expect(result).toEqual([step(2, 1), step(1, 1), step(2, 2), step(3, 1)]);
  });

  it('honors prerequisites across groups (prereq in a later group)', () => {
    // Z (perc/will) requires Y1 (int/mem): the perc/will group must split around Y1.
    const skills = skillMap(
      skill(1, 'perception', 'willpower'),
      skill(2, 'intelligence', 'memory'),
      skill(3, 'perception', 'willpower', [{ typeID: 2, level: 1 }])
    );
    const steps = [step(1, 1), step(2, 1), step(3, 1)];
    const result = suggestReorder(steps, skills);
    expect(result).toEqual([step(1, 1), step(2, 1), step(3, 1)]);
    expect(isValidOrder(result, skills)).toBe(true);
  });

  it('produces a valid permutation for a deep prereq chain across pairs', () => {
    const skills = skillMap(
      skill(1, 'perception', 'willpower'),
      skill(2, 'intelligence', 'memory', [{ typeID: 1, level: 3 }]),
      skill(3, 'perception', 'willpower', [{ typeID: 2, level: 2 }]),
      skill(4, 'charisma', 'willpower', [{ typeID: 3, level: 1 }])
    );
    const steps = [
      step(1, 1),
      step(1, 2),
      step(1, 3),
      step(2, 1),
      step(2, 2),
      step(3, 1),
      step(4, 1),
      step(1, 4),
      step(2, 3),
    ];
    const result = suggestReorder(steps, skills);
    expect(sortedKey(result)).toBe(sortedKey(steps));
    expect(isValidOrder(result, skills)).toBe(true);
    // Grouping should pull the free perc/will step 1:4 up next to 3:1.
    const pairAt = (s: PlanStep): string => {
      const sk = skills.get(s.skillTypeID)!;
      return `${sk.primary}|${sk.secondary}`;
    };
    const boundaries = result.reduce(
      (count, s, i) => (i > 0 && pairAt(s) !== pairAt(result[i - 1]) ? count + 1 : count),
      0
    );
    const originalBoundaries = steps.reduce(
      (count, s, i) => (i > 0 && pairAt(s) !== pairAt(steps[i - 1]) ? count + 1 : count),
      0
    );
    expect(boundaries).toBeLessThanOrEqual(originalBoundaries);
  });

  it('keeps same-skill levels ascending under grouping pressure', () => {
    const skills = skillMap(
      skill(1, 'perception', 'willpower'),
      skill(2, 'intelligence', 'memory')
    );
    const steps = [step(1, 1), step(2, 1), step(1, 2), step(2, 2), step(1, 3)];
    const result = suggestReorder(steps, skills);
    expect(result).toEqual([step(1, 1), step(1, 2), step(1, 3), step(2, 1), step(2, 2)]);
  });

  it('throws on unknown skill typeIDs', () => {
    expect(() => suggestReorder([step(99, 1)], skillMap())).toThrow(/99/);
  });

  describe('with priorities', () => {
    it('pulls a high-priority group ahead of a normal-priority group that occurs first', () => {
      const skills = skillMap(
        skill(1, 'perception', 'willpower'),
        skill(2, 'intelligence', 'memory')
      );
      const steps = [step(1, 1), step(2, 1)];
      const priorities = new Map([[2, 'high' as const]]);
      const result = suggestReorder(steps, skills, priorities);
      expect(result).toEqual([step(2, 1), step(1, 1)]);
    });

    it('keeps original (first-occurrence) group order among equal-priority groups', () => {
      const skills = skillMap(
        skill(1, 'perception', 'willpower'),
        skill(2, 'intelligence', 'memory')
      );
      const steps = [step(1, 1), step(2, 1)];
      const result = suggestReorder(steps, skills, new Map());
      expect(result).toEqual(steps);
    });

    it('never places a step before a lower-priority prerequisite it still needs', () => {
      // Z (high, perc/will) requires Y1 (normal, int/mem).
      const skills = skillMap(
        skill(1, 'intelligence', 'memory'),
        skill(2, 'perception', 'willpower', [{ typeID: 1, level: 1 }])
      );
      const steps = [step(1, 1), step(2, 1)];
      const priorities = new Map([[2, 'high' as const]]);
      const result = suggestReorder(steps, skills, priorities);
      expect(result).toEqual([step(1, 1), step(2, 1)]);
      expect(isValidOrder(result, skills)).toBe(true);
    });

    it('omitting priorities behaves exactly like the pure attribute-pair grouping', () => {
      const skills = skillMap(
        skill(1, 'perception', 'willpower'),
        skill(2, 'intelligence', 'memory'),
        skill(3, 'perception', 'willpower')
      );
      const steps = [step(1, 1), step(2, 1), step(3, 1), step(2, 2)];
      expect(suggestReorder(steps, skills)).toEqual(suggestReorder(steps, skills, new Map()));
    });
  });
});
