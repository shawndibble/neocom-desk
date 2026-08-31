import { describe, it, expect } from 'vitest';
import { effectivePriority, higherPriority, priorityRank } from '@/engine/planPriority';
import type {
  AttributeName,
  EngineSkill,
  PlanEntry,
  PlanPriority,
  SkillPrereq,
} from '@/engine/types';

const skill = (
  typeID: number,
  prereqs: SkillPrereq[] = [],
  attrs: [AttributeName, AttributeName] = ['perception', 'willpower']
): EngineSkill => ({
  typeID,
  name: `Skill ${typeID}`,
  rank: 1,
  primary: attrs[0],
  secondary: attrs[1],
  prereqs,
});

const skillMap = (...list: EngineSkill[]): Map<number, EngineSkill> =>
  new Map(list.map((s) => [s.typeID, s]));

const entry = (skillTypeID: number, targetLevel: number, priority?: PlanPriority): PlanEntry =>
  priority ? { skillTypeID, targetLevel, priority } : { skillTypeID, targetLevel };

describe('priorityRank / higherPriority', () => {
  it('ranks high as more urgent than normal, normal more urgent than low', () => {
    expect(priorityRank('high')).toBeLessThan(priorityRank('normal'));
    expect(priorityRank('normal')).toBeLessThan(priorityRank('low'));
  });

  it('higherPriority returns whichever is more urgent', () => {
    expect(higherPriority('low', 'high')).toBe('high');
    expect(higherPriority('high', 'low')).toBe('high');
    expect(higherPriority('normal', 'low')).toBe('normal');
    expect(higherPriority('normal', 'normal')).toBe('normal');
  });
});

describe('effectivePriority', () => {
  it('defaults an entry with no explicit priority to normal', () => {
    const skills = skillMap(skill(1));
    expect(effectivePriority([entry(1, 3)], skills)).toEqual(new Map([[1, 'normal']]));
  });

  it('keeps an entry at its own explicit priority when it has no prereqs', () => {
    const skills = skillMap(skill(1));
    expect(effectivePriority([entry(1, 3, 'high')], skills)).toEqual(new Map([[1, 'high']]));
  });

  it('propagates a dependent priority to its prerequisite', () => {
    const skills = skillMap(skill(1), skill(2, [{ typeID: 1, level: 3 }]));
    const result = effectivePriority([entry(1, 3), entry(2, 1, 'high')], skills);
    expect(result.get(1)).toBe('high');
    expect(result.get(2)).toBe('high');
  });

  it('a prerequisite inherits the highest urgency among everything that needs it', () => {
    // Skill 1 is a prereq of both skill 2 (low) and skill 3 (high).
    const skills = skillMap(
      skill(1),
      skill(2, [{ typeID: 1, level: 1 }]),
      skill(3, [{ typeID: 1, level: 1 }])
    );
    const result = effectivePriority(
      [entry(1, 1), entry(2, 1, 'low'), entry(3, 1, 'high')],
      skills
    );
    expect(result.get(1)).toBe('high');
  });

  it('a prerequisite that is itself a low-priority entry is bumped up (never below a dependent)', () => {
    const skills = skillMap(skill(1), skill(2, [{ typeID: 1, level: 1 }]));
    const result = effectivePriority([entry(1, 1, 'low'), entry(2, 1, 'high')], skills);
    expect(result.get(1)).toBe('high');
  });

  it('propagates through a transitive prereq chain', () => {
    const skills = skillMap(
      skill(1),
      skill(2, [{ typeID: 1, level: 1 }]),
      skill(3, [{ typeID: 2, level: 1 }])
    );
    const result = effectivePriority([entry(1, 1), entry(2, 1), entry(3, 1, 'high')], skills);
    expect(result.get(1)).toBe('high');
    expect(result.get(2)).toBe('high');
    expect(result.get(3)).toBe('high');
  });

  it('a prereq pulled in only implicitly (not its own entry) still gets the map entry', () => {
    const skills = skillMap(skill(1), skill(2, [{ typeID: 1, level: 1 }]));
    const result = effectivePriority([entry(2, 1, 'high')], skills);
    expect(result.get(1)).toBe('high');
  });

  it('a skill unrelated to any entry never appears in the map', () => {
    const skills = skillMap(skill(1), skill(99));
    const result = effectivePriority([entry(1, 1)], skills);
    expect(result.has(99)).toBe(false);
  });

  it('throws on an entry referencing an unknown skill typeID', () => {
    expect(() => effectivePriority([entry(404, 1)], skillMap())).toThrow(/404/);
  });
});
