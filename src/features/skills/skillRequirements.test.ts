import { describe, it, expect } from 'vitest';
import { buildSkillRequirements } from './skillRequirements';
import type { SkillCatalog } from './skillMap';
import type { SkillType } from '@/sde/types';
import type { EngineSkill, TrainedSkill } from '@/engine/types';

function sdeSkill(overrides: Partial<SkillType> & { typeID: number; name: string }): SkillType {
  return {
    description: '',
    groupID: 1,
    groupName: 'Group',
    rank: 1,
    primaryAttr: 'intelligence',
    secondaryAttr: 'memory',
    prereqs: [],
    ...overrides,
  };
}

function engineSkill(overrides: Partial<EngineSkill> & { typeID: number }): EngineSkill {
  return {
    name: `Skill ${overrides.typeID}`,
    rank: 1,
    primary: 'intelligence',
    secondary: 'memory',
    prereqs: [],
    ...overrides,
  };
}

function catalogOf(skills: EngineSkill[], sde: SkillType[]): SkillCatalog {
  const engineSkills = new Map(skills.map((s) => [s.typeID, s]));
  const bySkillTypeID = new Map(sde.map((s) => [s.typeID, s]));
  const unlocksByTypeID = new Map<number, { typeID: number; level: number }[]>();
  for (const skill of skills) {
    for (const prereq of skill.prereqs) {
      const list = unlocksByTypeID.get(prereq.typeID) ?? [];
      list.push({ typeID: skill.typeID, level: prereq.level });
      unlocksByTypeID.set(prereq.typeID, list);
    }
  }
  return { engineSkills, bySkillTypeID, unlocksByTypeID };
}

describe('buildSkillRequirements', () => {
  const catalog = catalogOf(
    [engineSkill({ typeID: 1 }), engineSkill({ typeID: 2, prereqs: [{ typeID: 1, level: 3 }] })],
    [sdeSkill({ typeID: 1, name: 'Spaceship Command' }), sdeSkill({ typeID: 2, name: 'Frigate' })]
  );

  it('returns null for a typeID the catalog does not know', () => {
    expect(buildSkillRequirements(catalog, new Map(), 999)).toBeNull();
  });

  it('marks a prereq trained when the trained level meets the requirement', () => {
    const trainedSkills = new Map<number, TrainedSkill>([[1, { level: 3, sp: 1 }]]);
    const result = buildSkillRequirements(catalog, trainedSkills, 2);
    expect(result?.prereqs).toEqual([
      { typeID: 1, name: 'Spaceship Command', level: 3, trained: true },
    ]);
  });

  it('marks a prereq untrained when the trained level falls short', () => {
    const trainedSkills = new Map<number, TrainedSkill>([[1, { level: 1, sp: 1 }]]);
    const result = buildSkillRequirements(catalog, trainedSkills, 2);
    expect(result?.prereqs).toEqual([
      { typeID: 1, name: 'Spaceship Command', level: 3, trained: false },
    ]);
  });

  it('treats a skill with no trained-skills entry as untrained (level 0)', () => {
    const result = buildSkillRequirements(catalog, new Map(), 2);
    expect(result?.prereqs[0].trained).toBe(false);
  });

  it('reads unlocks from the catalog reverse index', () => {
    const result = buildSkillRequirements(catalog, new Map(), 1);
    expect(result?.unlocks).toEqual([{ typeID: 2, name: 'Frigate', level: 3 }]);
    expect(result?.prereqs).toEqual([]);
  });

  it('falls back to #typeID when a referenced skill has no SDE name', () => {
    const withGap = catalogOf(
      [engineSkill({ typeID: 1 }), engineSkill({ typeID: 2, prereqs: [{ typeID: 1, level: 1 }] })],
      [sdeSkill({ typeID: 2, name: 'Frigate' })] // typeID 1 missing from bySkillTypeID
    );
    const result = buildSkillRequirements(withGap, new Map(), 2);
    expect(result?.prereqs).toEqual([{ typeID: 1, name: '#1', level: 1, trained: false }]);
  });
});
