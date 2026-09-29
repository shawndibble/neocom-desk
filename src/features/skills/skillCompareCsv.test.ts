import { describe, it, expect } from 'vitest';
import { skillCompareCsvColumns } from './skillCompareCsv';
import type { ComparisonRow } from './compareSkills';

const t = (k: string) => k;

const row: ComparisonRow = {
  skillTypeID: 3300,
  name: 'Gunnery',
  groupName: 'Gunnery',
  levels: new Map([
    [1, 5],
    [2, 3],
  ]),
  maxLevel: 5,
};

describe('skillCompareCsvColumns', () => {
  it('orders columns skill, group, then one per character named for them', () => {
    const columns = skillCompareCsvColumns(t, [1, 2, 3], (id) => `Pilot ${id}`);
    expect(columns.map((c) => c.header)).toEqual([
      'skillCompare.skillColumn',
      'skillCompare.groupColumn',
      'Pilot 1',
      'Pilot 2',
      'Pilot 3',
    ]);
  });

  it('emits each level as a raw number, 0 for a character without the skill', () => {
    const columns = skillCompareCsvColumns(t, [1, 2, 3], String);
    expect(columns.map((c) => c.value(row))).toEqual(['Gunnery', 'Gunnery', 5, 3, 0]);
  });
});
