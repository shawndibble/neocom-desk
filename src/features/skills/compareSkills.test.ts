import { describe, it, expect } from 'vitest';
import {
  buildComparisonRows,
  levelOf,
  groupBands,
  hasDifferingLevels,
  idsNeedingFetch,
  levelDelta,
  resolveBaseline,
  splitDiffering,
} from './compareSkills';
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

function skillRow(
  skillTypeID: number,
  groupName: string,
  levels: [number, number][]
): ComparisonRow {
  const map = new Map(levels);
  return {
    skillTypeID,
    name: `Skill ${skillTypeID}`,
    groupName,
    levels: map,
  };
}

describe('levelDelta', () => {
  it('is same when the levels match', () => {
    expect(levelDelta(3, 3)).toEqual({ kind: 'same' });
  });

  it('is ahead by the gap when above the baseline', () => {
    expect(levelDelta(5, 3)).toEqual({ kind: 'ahead', by: 2 });
  });

  it('is behind by the gap when below the baseline but trained', () => {
    expect(levelDelta(1, 4)).toEqual({ kind: 'behind', by: 3 });
  });

  it('is missing, not behind, when the character has no level of a skill the baseline has', () => {
    expect(levelDelta(0, 4)).toEqual({ kind: 'missing' });
  });

  it('is ahead when the baseline has none and the character does', () => {
    expect(levelDelta(2, 0)).toEqual({ kind: 'ahead', by: 2 });
  });
});

describe('splitDiffering', () => {
  it('separates differing rows from identical ones and counts the identical', () => {
    const differing = skillRow(1, 'A', [
      [1, 3],
      [2, 1],
    ]);
    const identical = skillRow(2, 'A', [
      [1, 5],
      [2, 5],
    ]);
    const result = splitDiffering([differing, identical]);
    expect(result.differing).toEqual([differing]);
    expect(result.identical).toEqual([identical]);
  });

  it('treats every row as identical for a single character', () => {
    const only = skillRow(1, 'A', [[1, 3]]);
    expect(splitDiffering([only]).identical).toEqual([only]);
  });
});

describe('groupBands', () => {
  it('groups consecutive rows by group name in order', () => {
    const rows = [
      skillRow(1, 'Gunnery', [
        [1, 4],
        [2, 2],
      ]),
      skillRow(2, 'Gunnery', [
        [1, 3],
        [2, 5],
      ]),
      skillRow(3, 'Navigation', [
        [1, 1],
        [2, 1],
      ]),
    ];
    const bands = groupBands(rows, [1, 2], 1);
    expect(bands.map((b) => b.groupName)).toEqual(['Gunnery', 'Navigation']);
    expect(bands[0]?.rows.map((r) => r.skillTypeID)).toEqual([1, 2]);
  });

  it("sums each character's level difference from the baseline across the band", () => {
    const rows = [
      skillRow(1, 'Gunnery', [
        [1, 4],
        [2, 2],
      ]),
      skillRow(2, 'Gunnery', [
        [1, 3],
        [2, 5],
      ]),
    ];
    const [band] = groupBands(rows, [1, 2], 1);
    expect(band?.netDelta.get(2)).toBe(0);
    const [skewed] = groupBands([rows[0]!], [1, 2], 1);
    expect(skewed?.netDelta.get(2)).toBe(-2);
    expect(skewed?.netDelta.get(1)).toBe(0);
  });
});

describe('resolveBaseline', () => {
  it('keeps the requested baseline while it is still selected', () => {
    expect(resolveBaseline([1, 2, 3], 2)).toBe(2);
  });

  it('falls back to the first selected character when the request is gone or absent', () => {
    expect(resolveBaseline([4, 5], 9)).toBe(4);
    expect(resolveBaseline([4, 5], null)).toBe(4);
  });

  it('prefers the preferred character over the first when no baseline was requested', () => {
    expect(resolveBaseline([4, 5], null, 5)).toBe(5);
    expect(resolveBaseline([4, 5], 4, 5)).toBe(4);
  });

  it('ignores a preferred character that is not selected', () => {
    expect(resolveBaseline([4, 5], null, 9)).toBe(4);
  });

  it('is null with nothing selected', () => {
    expect(resolveBaseline([], 1)).toBeNull();
  });
});

describe('levelOf', () => {
  it('reads a level of a skill, 0 when it has none or there is no character', () => {
    const r = skillRow(1, 'A', [[1, 4]]);
    expect(levelOf(r, 1)).toBe(4);
    expect(levelOf(r, 2)).toBe(0);
    expect(levelOf(r, null)).toBe(0);
  });
});
