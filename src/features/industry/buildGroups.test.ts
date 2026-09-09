import { describe, expect, it } from 'vitest';
import {
  addBuildGroup,
  buildGroupsFor,
  parseBuildGroups,
  removeBuildGroup,
  renameBuildGroup,
  withBuildGroups,
  type BuildGroup,
  type BuildGroupsValue,
} from './buildGroups';

const groups = (...names: string[]): BuildGroup[] =>
  names.map((name, i) => ({ id: `g${i + 1}`, name, order: i }));

describe('parseBuildGroups', () => {
  it('reads a well-formed per-Character map', () => {
    const raw = { 1: [{ id: 'g1', name: 'Buzzard', order: 0 }] };
    expect(parseBuildGroups(raw)).toEqual({ 1: [{ id: 'g1', name: 'Buzzard', order: 0 }] });
  });

  it('returns an empty map for anything that is not one', () => {
    // Whatever the last device to sync wrote, possibly an older build or a
    // hand-edited row — so it is validated rather than trusted, the same way
    // customsOverride.ts validates its own blob.
    expect(parseBuildGroups(null)).toEqual({});
    expect(parseBuildGroups('nope')).toEqual({});
    expect(parseBuildGroups([])).toEqual({});
    expect(parseBuildGroups(undefined)).toEqual({});
  });

  it('drops entries that are not usable groups', () => {
    const raw = {
      1: [
        { id: 'g1', name: 'Keep', order: 0 },
        { id: '', name: 'No id', order: 1 },
        { id: 'g3', name: '', order: 2 },
        { id: 'g4', name: 'Bad order', order: Number.NaN },
        'not an object',
      ],
      notANumber: [{ id: 'g9', name: 'Orphan', order: 0 }],
    };
    expect(parseBuildGroups(raw)).toEqual({ 1: [{ id: 'g1', name: 'Keep', order: 0 }] });
  });

  it('drops a Character whose every group was unusable, rather than keeping an empty list', () => {
    expect(parseBuildGroups({ 1: [{ id: '', name: '', order: 0 }] })).toEqual({});
  });
});

describe('buildGroupsFor', () => {
  it('returns one Character’s groups in order', () => {
    const value: BuildGroupsValue = {
      1: [
        { id: 'b', name: 'Second', order: 1 },
        { id: 'a', name: 'First', order: 0 },
      ],
    };
    expect(buildGroupsFor(value, 1).map((g) => g.name)).toEqual(['First', 'Second']);
  });

  it('returns nothing for a Character with none', () => {
    expect(buildGroupsFor({}, 42)).toEqual([]);
  });
});

describe('addBuildGroup', () => {
  it('appends a group after the Character’s existing ones', () => {
    const value = withBuildGroups({}, 1, groups('First'));
    const next = addBuildGroup(value, 1, { id: 'g2', name: 'Second' });
    expect(buildGroupsFor(next, 1)).toEqual([
      { id: 'g1', name: 'First', order: 0 },
      { id: 'g2', name: 'Second', order: 1 },
    ]);
  });

  it('keeps other Characters untouched', () => {
    const value = withBuildGroups({}, 2, groups('Theirs'));
    const next = addBuildGroup(value, 1, { id: 'g9', name: 'Mine' });
    expect(buildGroupsFor(next, 2).map((g) => g.name)).toEqual(['Theirs']);
    expect(buildGroupsFor(next, 1).map((g) => g.name)).toEqual(['Mine']);
  });

  it('allows two groups to share a name', () => {
    // Groups are id-keyed, exactly as two Build Plans may share a name.
    const value = addBuildGroup(withBuildGroups({}, 1, groups('PvE')), 1, {
      id: 'g2',
      name: 'PvE',
    });
    expect(buildGroupsFor(value, 1)).toHaveLength(2);
  });
});

describe('renameBuildGroup', () => {
  it('renames one group and leaves its order alone', () => {
    const value = withBuildGroups({}, 1, groups('Old', 'Other'));
    const next = renameBuildGroup(value, 1, 'g1', 'New');
    expect(buildGroupsFor(next, 1)).toEqual([
      { id: 'g1', name: 'New', order: 0 },
      { id: 'g2', name: 'Other', order: 1 },
    ]);
  });

  it('ignores a blank name rather than leaving a group unnameable', () => {
    const value = withBuildGroups({}, 1, groups('Keep'));
    expect(renameBuildGroup(value, 1, 'g1', '   ')).toEqual(value);
  });

  it('trims the new name', () => {
    const value = withBuildGroups({}, 1, groups('Old'));
    expect(buildGroupsFor(renameBuildGroup(value, 1, 'g1', '  Tidy  '), 1)[0].name).toBe('Tidy');
  });
});

describe('removeBuildGroup', () => {
  it('removes one group and renumbers the rest', () => {
    const value = withBuildGroups({}, 1, groups('A', 'B', 'C'));
    const next = removeBuildGroup(value, 1, 'g2');
    expect(buildGroupsFor(next, 1)).toEqual([
      { id: 'g1', name: 'A', order: 0 },
      { id: 'g3', name: 'C', order: 1 },
    ]);
  });

  it('drops the Character’s entry entirely once the last group goes', () => {
    // Nothing to store is stored as nothing, so a device that made a group and
    // deleted it is byte-identical to one that never did.
    const value = withBuildGroups({}, 1, groups('Only'));
    expect(removeBuildGroup(value, 1, 'g1')).toEqual({});
  });
});

describe('withBuildGroups', () => {
  it('keeps an empty group, which is the whole reason this is not derived from the plans', () => {
    // A group with no members has to exist between "create" and the first
    // plan moved into it. A groupBy over the plans cannot represent that,
    // which is why the names live here rather than being derived.
    const value = withBuildGroups({}, 1, [{ id: 'g1', name: 'Empty', order: 0 }]);
    expect(buildGroupsFor(value, 1)).toEqual([{ id: 'g1', name: 'Empty', order: 0 }]);
  });
});
