import { describe, it, expect, vi } from 'vitest';
import type { SkillType } from '@/sde/types';

const FIXTURE: SkillType[] = [
  {
    typeID: 1,
    name: 'Spaceship Command',
    description: '',
    groupID: 10,
    groupName: 'Spaceship Command',
    rank: 1,
    primaryAttr: 'perception',
    secondaryAttr: 'willpower',
    prereqs: [],
  },
  {
    typeID: 2,
    name: 'Advanced Spaceship Command',
    description: '',
    groupID: 10,
    groupName: 'Spaceship Command',
    rank: 5,
    primaryAttr: 'perception',
    secondaryAttr: 'willpower',
    prereqs: [{ skillTypeID: 1, level: 5 }],
  },
];

vi.mock('@/sde/loadSde', () => ({ loadSkills: vi.fn(async () => FIXTURE) }));

const { loadSkillCatalog, toTrainedSkillsMap, toAttributeBaseline } = await import('./skillMap');

describe('loadSkillCatalog', () => {
  it('adapts SDE skill rows to engine shape, remapping prereq field names', async () => {
    const catalog = await loadSkillCatalog();
    expect(catalog.engineSkills.get(2)).toEqual({
      typeID: 2,
      name: 'Advanced Spaceship Command',
      rank: 5,
      primary: 'perception',
      secondary: 'willpower',
      prereqs: [{ typeID: 1, level: 5 }],
    });
    expect(catalog.bySkillTypeID.get(1)?.groupName).toBe('Spaceship Command');
  });

  it('builds the skill-unlocks reverse index once, from the same prereq data', async () => {
    const catalog = await loadSkillCatalog();
    expect(catalog.unlocksByTypeID.get(1)).toEqual([{ typeID: 2, level: 5 }]);
    expect(catalog.unlocksByTypeID.get(2)).toBeUndefined();
  });
});

describe('toTrainedSkillsMap', () => {
  it('keys by skill_id and keeps trained level + sp', () => {
    const map = toTrainedSkillsMap([
      { skill_id: 1, trained_skill_level: 5, active_skill_level: 5, skillpoints_in_skill: 256000 },
    ]);
    expect(map.get(1)).toEqual({ level: 5, sp: 256000 });
  });
});

describe('toAttributeBaseline', () => {
  it('drops remap-metadata fields', () => {
    expect(
      toAttributeBaseline({
        charisma: 19,
        intelligence: 20,
        memory: 20,
        perception: 20,
        willpower: 20,
        bonus_remaps: 1,
      })
    ).toEqual({
      kind: 'legal',
      attributes: { charisma: 19, intelligence: 20, memory: 20, perception: 20, willpower: 20 },
    });
  });

  // ESI attribute values already include implant bonuses; the engine expects
  // base + remap only (implants are applied separately by computeSchedule and
  // the optimizer). Regression for UX-REVIEW #2's "Savings: 0m" contradiction.
  it('subtracts implant bonuses so the engine gets base attributes', () => {
    expect(
      toAttributeBaseline(
        {
          charisma: 21,
          intelligence: 24,
          memory: 20,
          perception: 25,
          willpower: 20,
        },
        { charisma: 2, intelligence: 4, perception: 5 }
      )
    ).toEqual({
      kind: 'legal',
      attributes: { charisma: 19, intelligence: 20, memory: 20, perception: 20, willpower: 20 },
    });
  });

  // The reported bug. ESI bakes an in-game cerebral accelerator into the same
  // values it bakes implants into, and nothing took it back out: the derived
  // "base" sheet totalled 159 against EVE's 99-point budget, so no legal remap
  // could beat it and the optimizer reported zero savings without saying why.
  it('recovers a cerebral accelerator baked into the ESI values', () => {
    expect(
      toAttributeBaseline(
        {
          intelligence: 29,
          memory: 42,
          perception: 38,
          willpower: 29,
          charisma: 31,
        },
        { memory: 4, perception: 4, charisma: 2 }
      )
    ).toEqual({
      kind: 'accelerated',
      acceleratorBonus: 12,
      attributes: {
        intelligence: 17,
        memory: 26,
        perception: 22,
        willpower: 17,
        charisma: 17,
      },
    });
  });

  it('recovers a smaller accelerator tier from the same sheet', () => {
    const result = toAttributeBaseline(
      {
        intelligence: 21,
        memory: 34,
        perception: 30,
        willpower: 21,
        charisma: 23,
      },
      { memory: 4, perception: 4, charisma: 2 }
    );
    expect(result).toEqual({
      kind: 'accelerated',
      acceleratorBonus: 4,
      attributes: {
        intelligence: 17,
        memory: 26,
        perception: 22,
        willpower: 17,
        charisma: 17,
      },
    });
  });

  // The floor clamp this function used to apply turned an implant misread into
  // a plausible-looking sheet. Reporting it is the point.
  it('reports a sheet it cannot explain rather than clamping it into range', () => {
    const result = toAttributeBaseline(
      {
        charisma: 19,
        intelligence: 18,
        memory: 20,
        perception: 20,
        willpower: 20,
      },
      { intelligence: 5 }
    );
    expect(result.kind).toBe('impossible');
  });
});
