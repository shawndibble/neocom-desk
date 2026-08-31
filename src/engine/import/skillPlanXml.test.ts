import { describe, it, expect } from 'vitest';
import { parseSkillPlanXml } from '@/engine/import/skillPlanXml';

const CATALOG = new Map([
  ['gunnery', { typeID: 3300 }],
  ['spaceship command', { typeID: 3327 }],
  ['caldari frigate', { typeID: 3335 }],
]);

describe('parseSkillPlanXml', () => {
  it('resolves entries by skill name', () => {
    const result = parseSkillPlanXml({ entries: [{ skillName: 'Gunnery', level: 4 }] }, CATALOG);
    expect(result.entries).toEqual([{ skillTypeID: 3300, targetLevel: 4 }]);
    expect(result.errors).toEqual([]);
  });

  it('preserves the priority attribute', () => {
    const result = parseSkillPlanXml(
      { entries: [{ skillName: 'Gunnery', level: 4, priority: 2 }] },
      CATALOG
    );
    expect(result.entries).toEqual([{ skillTypeID: 3300, targetLevel: 4, priority: 2 }]);
  });

  it('never emits an explicit priority: undefined key for an entry with no priority', () => {
    // A bare `priority: undefined` key would later clobber an existing
    // priority when a caller merges this entry via object-spread.
    const result = parseSkillPlanXml({ entries: [{ skillName: 'Gunnery', level: 4 }] }, CATALOG);
    expect(Object.prototype.hasOwnProperty.call(result.entries[0], 'priority')).toBe(false);
  });

  it('dedupes duplicate entries keeping the highest level (and its priority)', () => {
    const result = parseSkillPlanXml(
      {
        entries: [
          { skillName: 'Gunnery', level: 1, priority: 5 },
          { skillName: 'Gunnery', level: 4, priority: 2 },
          { skillName: 'Gunnery', level: 2, priority: 1 },
        ],
      },
      CATALOG
    );
    expect(result.entries).toEqual([{ skillTypeID: 3300, targetLevel: 4, priority: 2 }]);
  });

  it('is case-insensitive on skill name lookup', () => {
    const result = parseSkillPlanXml({ entries: [{ skillName: 'gunnery', level: 4 }] }, CATALOG);
    expect(result.entries).toEqual([{ skillTypeID: 3300, targetLevel: 4 }]);
  });

  it('reports an unknown skill name as an error, not a throw', () => {
    const result = parseSkillPlanXml(
      { entries: [{ skillName: 'Not A Real Skill', level: 3 }] },
      CATALOG
    );
    expect(result.entries).toEqual([]);
    expect(result.errors).toEqual([
      { path: 'entry[0] "Not A Real Skill"', reason: 'unknown skill: Not A Real Skill' },
    ]);
  });

  it('reports a level outside 1..5 as an error, not a throw', () => {
    const result = parseSkillPlanXml({ entries: [{ skillName: 'Gunnery', level: 9 }] }, CATALOG);
    expect(result.entries).toEqual([]);
    expect(result.errors).toEqual([
      { path: 'entry[0] "Gunnery"', reason: 'level out of range 1..5: 9' },
    ]);
  });

  it('ignores unrecognized fields on the intermediate object (forward-compat)', () => {
    const result = parseSkillPlanXml(
      {
        entries: [
          {
            skillName: 'Gunnery',
            level: 4,
            skillID: 3300,
            // @ts-expect-error unknown field from a divergent exporter, must not break parsing
            entryType: 'Prerequisite',
          },
        ],
      },
      CATALOG
    );
    expect(result.entries).toEqual([{ skillTypeID: 3300, targetLevel: 4 }]);
    expect(result.errors).toEqual([]);
  });

  it('handles an empty document', () => {
    expect(parseSkillPlanXml({ entries: [] }, CATALOG)).toEqual({ entries: [], errors: [] });
  });

  it('handles garbage input: all errors, no throw', () => {
    expect(() =>
      parseSkillPlanXml(
        {
          entries: [
            { skillName: '', level: 0 },
            { skillName: 'Gunnery', level: -1 },
          ],
        },
        CATALOG
      )
    ).not.toThrow();
    const result = parseSkillPlanXml(
      {
        entries: [
          { skillName: '', level: 0 },
          { skillName: 'Gunnery', level: -1 },
        ],
      },
      CATALOG
    );
    expect(result.entries).toEqual([]);
    expect(result.errors).toHaveLength(2);
  });
});
