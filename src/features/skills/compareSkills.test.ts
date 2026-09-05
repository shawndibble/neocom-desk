import { describe, it, expect } from 'vitest';
import { buildComparisonRows, hasDifferingLevels, idsNeedingFetch } from './compareSkills';
import type { ComparisonRow } from './compareSkills';
import type { TrainedSkill } from '@/engine/types';

const GUNNERY = 1;
const SPACESHIP_COMMAND = 2;
const UNKNOWN_SKILL = 99;

const CATALOG = new Map([
  [GUNNERY, { name: 'Gunnery', groupName: 'Gunnery' }],
  [SPACESHIP_COMMAND, { name: 'Spaceship Command', groupName: 'Spaceship Command' }],
]);

function trained(entries: [number, TrainedSkill][]): Map<number, TrainedSkill> {
  return new Map(entries);
}

describe('buildComparisonRows', () => {
  it('builds one row per skill any compared character has trained', () => {
    const skillsByCharacter = new Map([
      [1, trained([[GUNNERY, { level: 3, sp: 1000 }]])],
      [2, trained([[SPACESHIP_COMMAND, { level: 2, sp: 500 }]])],
    ]);

    const rows = buildComparisonRows([1, 2], skillsByCharacter, CATALOG);

    expect(rows.map((r) => r.skillTypeID).sort()).toEqual([GUNNERY, SPACESHIP_COMMAND]);
  });

  it('reads a character with no trained level for a skill as level 0, not omitted', () => {
    const skillsByCharacter = new Map([
      [1, trained([[GUNNERY, { level: 4, sp: 1000 }]])],
      [2, trained([])],
    ]);

    const rows = buildComparisonRows([1, 2], skillsByCharacter, CATALOG);

    const gunnery = rows.find((r) => r.skillTypeID === GUNNERY)!;
    expect(gunnery.levels.get(1)).toBe(4);
    expect(gunnery.levels.get(2)).toBe(0);
  });

  it('computes maxLevel as the highest level among compared characters', () => {
    const skillsByCharacter = new Map([
      [1, trained([[GUNNERY, { level: 3, sp: 1000 }]])],
      [2, trained([[GUNNERY, { level: 5, sp: 5000 }]])],
    ]);

    const rows = buildComparisonRows([1, 2], skillsByCharacter, CATALOG);

    expect(rows.find((r) => r.skillTypeID === GUNNERY)?.maxLevel).toBe(5);
  });

  it('sorts rows by group name, then skill name', () => {
    const skillsByCharacter = new Map([
      [
        1,
        trained([
          [SPACESHIP_COMMAND, { level: 1, sp: 1 }],
          [GUNNERY, { level: 1, sp: 1 }],
        ]),
      ],
    ]);

    const rows = buildComparisonRows([1], skillsByCharacter, CATALOG);

    expect(rows.map((r) => r.name)).toEqual(['Gunnery', 'Spaceship Command']);
  });

  it('falls back to a #typeID name and empty group for a skill the catalog does not carry', () => {
    const skillsByCharacter = new Map([[1, trained([[UNKNOWN_SKILL, { level: 1, sp: 1 }]])]]);

    const rows = buildComparisonRows([1], skillsByCharacter, CATALOG);

    expect(rows[0]).toMatchObject({ name: '#99', groupName: '' });
  });

  it('returns no rows when no compared character has trained anything', () => {
    const skillsByCharacter = new Map([
      [1, trained([])],
      [2, trained([])],
    ]);

    expect(buildComparisonRows([1, 2], skillsByCharacter, CATALOG)).toEqual([]);
  });

  it('returns no rows for a character id with no entry in the map at all', () => {
    expect(buildComparisonRows([1], new Map(), CATALOG)).toEqual([]);
  });
});

function row(levels: [number, number][]): ComparisonRow {
  return {
    skillTypeID: GUNNERY,
    name: 'Gunnery',
    groupName: 'Gunnery',
    levels: new Map(levels),
    maxLevel: Math.max(0, ...levels.map(([, level]) => level)),
  };
}

describe('hasDifferingLevels', () => {
  it('is false when every compared character has the same level', () => {
    expect(
      hasDifferingLevels(
        row([
          [1, 3],
          [2, 3],
        ])
      )
    ).toBe(false);
  });

  it('is true when levels differ between compared characters', () => {
    expect(
      hasDifferingLevels(
        row([
          [1, 3],
          [2, 5],
        ])
      )
    ).toBe(true);
  });

  it('is false for a single compared character, trivially equal to itself', () => {
    expect(hasDifferingLevels(row([[1, 4]]))).toBe(false);
  });

  it('is false when there are no compared characters at all', () => {
    expect(hasDifferingLevels(row([]))).toBe(false);
  });
});

describe('idsNeedingFetch', () => {
  it('returns only ids not already cached, in selection order', () => {
    expect(idsNeedingFetch([1, 2, 3], new Set([2]), false)).toEqual([1, 3]);
  });

  it('returns nothing when every selected id is already cached', () => {
    expect(idsNeedingFetch([1, 2], new Set([1, 2]), false)).toEqual([]);
  });

  it('returns every selected id when forced, ignoring the cache', () => {
    expect(idsNeedingFetch([1, 2], new Set([1, 2]), true)).toEqual([1, 2]);
  });

  it('returns everything when the cache is empty', () => {
    expect(idsNeedingFetch([1, 2], new Set(), false)).toEqual([1, 2]);
  });
});
