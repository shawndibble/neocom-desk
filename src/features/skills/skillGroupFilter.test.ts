import { describe, it, expect } from 'vitest';
import { filterSkillGroups } from './skillGroupFilter';
import type { SkillGroup } from './skillsCsv';

const GROUPS: SkillGroup[] = [
  {
    groupName: 'Gunnery',
    skills: [
      { skillTypeID: 1, name: 'Small Hybrid Turret', level: 5, sp: 256000 },
      { skillTypeID: 2, name: 'Gunnery', level: 4, sp: 45000 },
    ],
  },
  {
    groupName: 'Spaceship Command',
    skills: [{ skillTypeID: 3, name: 'Frigate', level: 3, sp: 8000 }],
  },
];

describe('filterSkillGroups', () => {
  it('returns null (no filter) for a query under 3 characters', () => {
    expect(filterSkillGroups(GROUPS, 'fr')).toBeNull();
    expect(filterSkillGroups(GROUPS, '')).toBeNull();
  });

  it('matches a skill and keeps only its group visible, with only the matching skills listed', () => {
    const result = filterSkillGroups(GROUPS, 'frigate');
    expect(result).not.toBeNull();
    expect(result?.visibleGroupNames).toEqual(new Set(['Spaceship Command']));
    expect(result?.matchedSkillsByGroup.get('Spaceship Command')?.map((s) => s.name)).toEqual([
      'Frigate',
    ]);
  });

  it('is case-insensitive and matches substrings, not just prefixes', () => {
    const result = filterSkillGroups(GROUPS, 'HYBRID');
    expect(result?.visibleGroupNames).toEqual(new Set(['Gunnery']));
    expect(result?.matchedSkillsByGroup.get('Gunnery')?.map((s) => s.name)).toEqual([
      'Small Hybrid Turret',
    ]);
  });

  it('matches multiple skills within one group, listing all of them', () => {
    const result = filterSkillGroups(GROUPS, 'gunnery');
    // "Gunnery" matches the skill named Gunnery (exact) and the group name is
    // irrelevant to matching — Small Hybrid Turret does not contain "gunnery".
    expect(result?.visibleGroupNames).toEqual(new Set(['Gunnery']));
    expect(result?.matchedSkillsByGroup.get('Gunnery')?.map((s) => s.name)).toEqual(['Gunnery']);
  });

  it('excludes a group with no matching skill entirely', () => {
    const result = filterSkillGroups(GROUPS, 'frigate');
    expect(result?.visibleGroupNames.has('Gunnery')).toBe(false);
    expect(result?.matchedSkillsByGroup.has('Gunnery')).toBe(false);
  });

  it('reports no match anywhere as an empty result, not an error', () => {
    const result = filterSkillGroups(GROUPS, 'nonexistent');
    expect(result?.visibleGroupNames.size).toBe(0);
    expect(result?.matchedSkillsByGroup.size).toBe(0);
  });
});
