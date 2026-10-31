import { describe, it, expect } from 'vitest';
import { skillCsvRows, skillCsvColumns, type SkillGroup } from './skillsCsv';
import { toCsv } from '@/lib/csv';

const identityT = (k: string) => k;

const groups: SkillGroup[] = [
  {
    groupName: 'Gunnery',
    skills: [
      {
        skillTypeID: 1,
        name: 'Small Hybrid Turret',
        level: 5,
        sp: 1234567,
        rank: 1,
        injected: true,
        queuedLevel: null,
        plannedLevel: null,
      },
      {
        skillTypeID: 2,
        name: 'Motion Prediction',
        level: 3,
        sp: 45000,
        rank: 1,
        injected: true,
        queuedLevel: null,
        plannedLevel: null,
      },
    ],
  },
  {
    groupName: 'Navigation',
    skills: [
      {
        skillTypeID: 3,
        name: 'Afterburner',
        level: 4,
        sp: 90000,
        rank: 1,
        injected: true,
        queuedLevel: null,
        plannedLevel: null,
      },
    ],
  },
];

describe('skillCsvRows', () => {
  it('emits one row per skill, preserving group order and within-group order', () => {
    expect(skillCsvRows(groups)).toEqual([
      {
        groupName: 'Gunnery',
        name: 'Small Hybrid Turret',
        level: 5,
        sp: 1234567,
        skillTypeId: 1,
        rank: 1,
        injected: true,
        queuedLevel: null,
        plannedLevel: null,
        description: '',
      },
      {
        groupName: 'Gunnery',
        name: 'Motion Prediction',
        level: 3,
        sp: 45000,
        skillTypeId: 2,
        rank: 1,
        injected: true,
        queuedLevel: null,
        plannedLevel: null,
        description: '',
      },
      {
        groupName: 'Navigation',
        name: 'Afterburner',
        level: 4,
        sp: 90000,
        skillTypeId: 3,
        rank: 1,
        injected: true,
        queuedLevel: null,
        plannedLevel: null,
        description: '',
      },
    ]);
  });

  it('returns an empty array for no groups', () => {
    expect(skillCsvRows([])).toEqual([]);
  });

  it('returns no rows for a group with no skills', () => {
    expect(skillCsvRows([{ groupName: 'Empty', skills: [] }])).toEqual([]);
  });
});

describe('skillCsvColumns', () => {
  it('uses the csv i18n keys, in order, as headers', () => {
    const columns = skillCsvColumns(identityT);
    expect(columns.map((c) => c.header)).toEqual([
      'skills.csvGroup',
      'skills.csvSkill',
      'skills.csvLevel',
      'skills.csvSp',
      'skills.csvRank',
      'skills.csvInjected',
      'skills.csvQueuedLevel',
      'skills.csvPlannedLevel',
      'skills.csvTypeId',
      'skills.csvDescription',
    ]);
  });

  it('emits level and sp as raw numbers, not localized strings', () => {
    const rows = skillCsvRows(groups);
    const columns = skillCsvColumns(identityT);
    const csv = toCsv(rows, columns);
    // Raw 1234567, never the localized "1,234,567".
    expect(csv).toContain('1234567');
    expect(csv).not.toContain('1,234,567');

    const levelColumn = columns[2];
    const spColumn = columns[3];
    expect(typeof levelColumn.value(rows[0])).toBe('number');
    expect(typeof spColumn.value(rows[0])).toBe('number');
  });

  it('flags an untrained skill as not injected and carries rank, queued level and type id', () => {
    const rows = skillCsvRows([
      {
        groupName: 'Gunnery',
        skills: [
          {
            skillTypeID: 9,
            name: 'Sharpshooter',
            level: 0,
            sp: null,
            rank: 3,
            injected: false,
            queuedLevel: 2,
            plannedLevel: 4,
          },
        ],
      },
    ]);
    const values = Object.fromEntries(
      skillCsvColumns(identityT).map((c) => [c.header, c.value(rows[0])])
    );
    expect(values).toMatchObject({
      'skills.csvInjected': 'skills.csvNo',
      'skills.csvRank': 3,
      'skills.csvQueuedLevel': 2,
      'skills.csvPlannedLevel': 4,
      'skills.csvDescription': '',
      'skills.csvTypeId': 9,
      'skills.csvSp': null,
    });
  });
});
