import { describe, it, expect, vi } from 'vitest';
import type { SkillType } from '@/sde/types';

const FIXTURE: SkillType[] = [
  {
    typeID: 1,
    name: 'Spaceship Command',
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
    groupID: 10,
    groupName: 'Spaceship Command',
    rank: 5,
    primaryAttr: 'perception',
    secondaryAttr: 'willpower',
    prereqs: [{ skillTypeID: 1, level: 5 }],
  },
];

vi.mock('@/sde/loadSde', () => ({ loadSkills: vi.fn(async () => FIXTURE) }));

const { loadSkillCatalog, toTrainedSkillsMap, toEngineAttributes } = await import('./skillMap');

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
});

describe('toTrainedSkillsMap', () => {
  it('keys by skill_id and keeps trained level + sp', () => {
    const map = toTrainedSkillsMap([
      { skill_id: 1, trained_skill_level: 5, active_skill_level: 5, skillpoints_in_skill: 256000 },
    ]);
    expect(map.get(1)).toEqual({ level: 5, sp: 256000 });
  });
});

describe('toEngineAttributes', () => {
  it('drops remap-metadata fields', () => {
    expect(
      toEngineAttributes({
        charisma: 19,
        intelligence: 20,
        memory: 20,
        perception: 20,
        willpower: 21,
        bonus_remaps: 1,
      })
    ).toEqual({ charisma: 19, intelligence: 20, memory: 20, perception: 20, willpower: 21 });
  });

  // ESI attribute values already include implant bonuses; the engine expects
  // base + remap only (implants are applied separately by computeSchedule and
  // the optimizer). Regression for UX-REVIEW #2's "Savings: 0m" contradiction.
  it('subtracts implant bonuses so the engine gets base attributes', () => {
    expect(
      toEngineAttributes(
        {
          charisma: 21,
          intelligence: 24,
          memory: 20,
          perception: 25,
          willpower: 21,
        },
        { charisma: 2, intelligence: 4, perception: 5 }
      )
    ).toEqual({ charisma: 19, intelligence: 20, memory: 20, perception: 20, willpower: 21 });
  });

  it('never returns a base attribute below the EVE minimum of 17', () => {
    expect(
      toEngineAttributes(
        {
          charisma: 19,
          intelligence: 18,
          memory: 20,
          perception: 20,
          willpower: 20,
        },
        { intelligence: 5 }
      ).intelligence
    ).toBe(17);
  });
});
