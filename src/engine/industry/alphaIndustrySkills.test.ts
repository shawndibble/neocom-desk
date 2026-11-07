import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SkillType } from '@/sde/types';
import { alphaIndustrySkills } from './alphaIndustrySkills';

const skill = (over: Partial<SkillType>): SkillType => ({
  typeID: 1,
  name: 'Skill',
  description: '',
  groupID: 268,
  groupName: 'Production',
  rank: 1,
  primaryAttr: 'memory',
  secondaryAttr: 'intelligence',
  prereqs: [],
  basePrice: 0,
  ...over,
});

describe('alphaIndustrySkills', () => {
  it('lists the Production and Science skills an Alpha can train, with their cap', () => {
    const result = alphaIndustrySkills([
      skill({ typeID: 3380, name: 'Industry', groupID: 268, alphaMaxLevel: 5 }),
      skill({ typeID: 3402, name: 'Science', groupID: 270, alphaMaxLevel: 4 }),
    ]);
    expect(result).toEqual([
      { typeID: 3380, name: 'Industry', level: 5 },
      { typeID: 3402, name: 'Science', level: 4 },
    ]);
  });

  it('leaves out Omega-only skills and skills outside Production and Science', () => {
    const result = alphaIndustrySkills([
      skill({ typeID: 3388, name: 'Advanced Industry', groupID: 268 }),
      skill({ typeID: 3386, name: 'Mining', groupID: 1218, alphaMaxLevel: 4 }),
    ]);
    expect(result).toEqual([]);
  });

  it('matches the shipped skills.json Alpha caps', () => {
    const skills = JSON.parse(
      readFileSync(resolve(process.cwd(), 'public/data/skills.json'), 'utf8')
    ) as SkillType[];
    expect(alphaIndustrySkills(skills)).toEqual([
      { typeID: 3380, name: 'Industry', level: 5 },
      { typeID: 3387, name: 'Mass Production', level: 3 },
      { typeID: 3402, name: 'Science', level: 4 },
    ]);
  });
});
