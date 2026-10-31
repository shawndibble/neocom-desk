import { describe, it, expect } from 'vitest';
import type { SkillType } from '@/sde/types';
import { buildSkillBoard, boardCsvGroups } from './skillBoard';
import { filterSkillGroups } from './skillGroupFilter';

function skill(typeID: number, name: string, groupName: string, extra: Partial<SkillType> = {}) {
  return {
    typeID,
    name,
    description: `${name} <b>desc</b>`,
    groupID: groupName.length,
    groupName,
    rank: 1,
    primaryAttr: 'perception',
    secondaryAttr: 'willpower',
    prereqs: [],
    ...extra,
  } satisfies SkillType;
}

const CATALOG: SkillType[] = [
  skill(3300, 'Gunnery', 'Gunnery'),
  skill(3301, 'Small Hybrid Turret', 'Gunnery', { prereqs: [{ skillTypeID: 3300, level: 1 }] }),
  skill(3305, 'Sharpshooter', 'Gunnery', { rank: 2, prereqs: [{ skillTypeID: 3300, level: 1 }] }),
  skill(3327, 'Spaceship Command', 'Spaceship Command'),
  skill(3330, 'Caldari Frigate', 'Spaceship Command', {
    prereqs: [{ skillTypeID: 3327, level: 1 }],
  }),
];

const board = (over: Partial<Parameters<typeof buildSkillBoard>[0]> = {}) =>
  buildSkillBoard({
    catalog: CATALOG,
    trained: new Map([
      [3300, { level: 5, sp: 256000 }],
      [3301, { level: 3, sp: 8000 }],
      [3327, { level: 0, sp: 0 }],
    ]),
    queuedLevels: new Map([[3301, 5]]),
    unknownGroupName: 'Unknown',
    ...over,
  });

describe('buildSkillBoard', () => {
  it('lists every catalog skill, trained or not, grouped and sorted by name', () => {
    const groups = board();
    expect(groups.map((g) => g.groupName)).toEqual(['Gunnery', 'Spaceship Command']);
    expect(groups[0]?.skills.map((s) => s.name)).toEqual([
      'Gunnery',
      'Sharpshooter',
      'Small Hybrid Turret',
    ]);
  });

  it('counts trained (level 1+) of total, and skills with a higher queued level', () => {
    const [gunnery, command] = board();
    expect(gunnery).toMatchObject({ total: 3, trained: 2, queued: 1 });
    // Spaceship Command is injected at 0, which is not trained yet.
    expect(command).toMatchObject({ total: 2, trained: 0, queued: 0 });
  });

  it('marks a skill as needing its book only when ESI does not list it at all', () => {
    const [gunnery, command] = board();
    const by = (name: string) =>
      [...gunnery!.skills, ...command!.skills].find((s) => s.name === name);
    expect(by('Sharpshooter')).toMatchObject({ injected: false, level: 0, sp: null });
    expect(by('Spaceship Command')).toMatchObject({ injected: true, level: 0 });
    expect(by('Gunnery')).toMatchObject({ injected: true, level: 5, sp: 256000 });
  });

  it('carries a queued level only when it is above the trained level', () => {
    const [gunnery] = board({
      queuedLevels: new Map([
        [3301, 5],
        [3300, 5],
      ]),
    });
    const q = (name: string) => gunnery!.skills.find((s) => s.name === name)?.queuedLevel;
    expect(q('Small Hybrid Turret')).toBe(5);
    expect(q('Gunnery')).toBeNull();
    expect(q('Sharpshooter')).toBeNull();
  });

  it('strips EVE markup from descriptions', () => {
    const [gunnery] = board();
    expect(gunnery?.skills[0]?.description).toBe('Gunnery desc');
  });

  it('files trained skills missing from the catalog under the unknown group, outside the catalog totals', () => {
    const groups = board({ trained: new Map([[9999, { level: 2, sp: 500 }]]) });
    const unknown = groups.find((g) => g.groupName === 'Unknown');
    expect(unknown).toMatchObject({ total: 1, trained: 1 });
    expect(unknown?.skills[0]).toMatchObject({ skillTypeID: 9999, name: '#9999', level: 2 });
  });
});

describe('boardCsvGroups', () => {
  it('keeps every skill the board lists, flagging the ones ESI does not list as not injected', () => {
    const csv = boardCsvGroups(board());
    expect(csv.map((g) => g.groupName)).toEqual(['Gunnery', 'Spaceship Command']);
    expect(csv[0]?.skills.map((s) => [s.name, s.level, s.sp, s.injected, s.queuedLevel])).toEqual([
      ['Gunnery', 5, 256000, true, null],
      ['Sharpshooter', 0, null, false, null],
      ['Small Hybrid Turret', 3, 8000, true, 5],
    ]);
    // With nothing trained the whole catalog is still there.
    expect(boardCsvGroups(board({ trained: new Map() })).flatMap((g) => g.skills)).toHaveLength(5);
  });
});

describe('filterSkillGroups over the board', () => {
  it('finds a skill the character has not trained', () => {
    const result = filterSkillGroups(board(), 'sharpshooter');
    expect(result?.visibleGroupNames).toEqual(new Set(['Gunnery']));
    expect(result?.matchedSkillsByGroup.get('Gunnery')?.[0]?.injected).toBe(false);
  });
});
