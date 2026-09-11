import { describe, expect, it } from 'vitest';
import type { OwnedStockScope } from '@/engine/industry/types';
import {
  addBuildGroup,
  buildGroupsFor,
  parseBuildGroups,
  removeBuildGroup,
  renameBuildGroup,
  withBuildGroups,
  withGroupCraftSweepDefault,
  withGroupOwnedStock,
  withGroupOwnedStockScope,
  withGroupSnapshot,
  type BuildGroup,
  type BuildGroupCraftSweepDefault,
  type BuildGroupSnapshot,
  type BuildGroupsValue,
} from './buildGroups';

const groups = (...names: string[]): BuildGroup[] =>
  names.map((name, i) => ({ id: `g${i + 1}`, name, order: i }));

const snapshot = (overrides: Partial<BuildGroupSnapshot> = {}): BuildGroupSnapshot => ({
  hubId: 'jita',
  facility: 'npcStation',
  security: 'highsec',
  appliedAt: 1000,
  ...overrides,
});

const craftSweepDefault = (
  overrides: Partial<BuildGroupCraftSweepDefault> = {}
): BuildGroupCraftSweepDefault => ({
  strategy: 'cost-effective',
  ...overrides,
});

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

describe('withGroupSnapshot', () => {
  it('sets a snapshot on one group, leaving the rest of the group untouched', () => {
    const value = withBuildGroups({}, 1, groups('Retarget me', 'Other'));
    const next = withGroupSnapshot(value, 1, 'g1', snapshot());
    expect(buildGroupsFor(next, 1)).toEqual([
      { id: 'g1', name: 'Retarget me', order: 0, snapshot: snapshot() },
      { id: 'g2', name: 'Other', order: 1 },
    ]);
  });

  it('replaces an existing snapshot rather than merging it', () => {
    const value = withGroupSnapshot(withBuildGroups({}, 1, groups('G')), 1, 'g1', snapshot());
    const next = withGroupSnapshot(value, 1, 'g1', snapshot({ hubId: 'amarr', appliedAt: 2000 }));
    expect(buildGroupsFor(next, 1)[0].snapshot).toEqual(
      snapshot({ hubId: 'amarr', appliedAt: 2000 })
    );
  });

  it('is a no-op for a group id that does not exist', () => {
    const value = withBuildGroups({}, 1, groups('G'));
    expect(withGroupSnapshot(value, 1, 'missing', snapshot())).toBe(value);
  });
});

describe('withGroupCraftSweepDefault', () => {
  it('sets a Craft Sweep default on one group, leaving the rest of the group untouched', () => {
    const value = withBuildGroups({}, 1, groups('Sweep me', 'Other'));
    const next = withGroupCraftSweepDefault(value, 1, 'g1', craftSweepDefault());
    expect(buildGroupsFor(next, 1)).toEqual([
      { id: 'g1', name: 'Sweep me', order: 0, craftSweepDefault: craftSweepDefault() },
      { id: 'g2', name: 'Other', order: 1 },
    ]);
  });

  it('replaces an existing default rather than merging it', () => {
    const value = withGroupCraftSweepDefault(
      withBuildGroups({}, 1, groups('G')),
      1,
      'g1',
      craftSweepDefault()
    );
    const next = withGroupCraftSweepDefault(
      value,
      1,
      'g1',
      craftSweepDefault({ strategy: 'build' })
    );
    expect(buildGroupsFor(next, 1)[0].craftSweepDefault).toEqual(
      craftSweepDefault({ strategy: 'build' })
    );
  });

  it('is a no-op for a group id that does not exist', () => {
    const value = withBuildGroups({}, 1, groups('G'));
    expect(withGroupCraftSweepDefault(value, 1, 'missing', craftSweepDefault())).toBe(value);
  });
});

describe('parseBuildGroups — craftSweepDefault', () => {
  it('keeps a group whose Craft Sweep default is well-formed', () => {
    const raw = {
      1: [{ id: 'g1', name: 'G', order: 0, craftSweepDefault: craftSweepDefault() }],
    };
    expect(parseBuildGroups(raw)).toEqual({
      1: [{ id: 'g1', name: 'G', order: 0, craftSweepDefault: craftSweepDefault() }],
    });
  });

  it('drops a group whose Craft Sweep default is malformed, rather than keeping the group without it', () => {
    const raw = {
      1: [{ id: 'g1', name: 'G', order: 0, craftSweepDefault: { strategy: 'not-a-strategy' } }],
    };
    expect(parseBuildGroups(raw)).toEqual({});
  });

  it('keeps a group whose stored Craft Sweep default still carries a pre-#798 depthChoice field — extra data, silently ignored', () => {
    const raw = {
      1: [
        {
          id: 'g1',
          name: 'G',
          order: 0,
          craftSweepDefault: { ...craftSweepDefault(), depthChoice: 'all' },
        },
      ],
    };
    expect(parseBuildGroups(raw)).toEqual({
      1: [
        {
          id: 'g1',
          name: 'G',
          order: 0,
          craftSweepDefault: { ...craftSweepDefault(), depthChoice: 'all' },
        },
      ],
    });
  });

  it('keeps a group with no Craft Sweep default at all — the pre-#696 shape', () => {
    const raw = { 1: [{ id: 'g1', name: 'G', order: 0 }] };
    expect(parseBuildGroups(raw)).toEqual({ 1: [{ id: 'g1', name: 'G', order: 0 }] });
  });
});

describe('withGroupOwnedStock', () => {
  it('sets the group ledger, leaving the rest of the group untouched', () => {
    const value = withBuildGroups({}, 1, groups('Owns stuff', 'Other'));
    const next = withGroupOwnedStock(value, 1, 'g1', { 34: 100, 35: 0 });
    expect(buildGroupsFor(next, 1)).toEqual([
      { id: 'g1', name: 'Owns stuff', order: 0, ownedStock: { 34: 100, 35: 0 } },
      { id: 'g2', name: 'Other', order: 1 },
    ]);
  });

  it('replaces the existing ledger rather than merging it', () => {
    const value = withGroupOwnedStock(withBuildGroups({}, 1, groups('G')), 1, 'g1', { 34: 100 });
    const next = withGroupOwnedStock(value, 1, 'g1', { 35: 5 });
    expect(buildGroupsFor(next, 1)[0].ownedStock).toEqual({ 35: 5 });
  });

  it('is a no-op for a group id that does not exist', () => {
    const value = withBuildGroups({}, 1, groups('G'));
    expect(withGroupOwnedStock(value, 1, 'missing', { 34: 1 })).toBe(value);
  });
});

describe('withGroupOwnedStockScope', () => {
  const scope: OwnedStockScope = { mode: 'everywhere' };

  it('sets the group ledger scope, leaving the rest of the group untouched', () => {
    const value = withBuildGroups({}, 1, groups('Scoped', 'Other'));
    const next = withGroupOwnedStockScope(value, 1, 'g1', scope);
    expect(buildGroupsFor(next, 1)).toEqual([
      { id: 'g1', name: 'Scoped', order: 0, ownedStockScope: scope },
      { id: 'g2', name: 'Other', order: 1 },
    ]);
  });

  it('is a no-op for a group id that does not exist', () => {
    const value = withBuildGroups({}, 1, groups('G'));
    expect(withGroupOwnedStockScope(value, 1, 'missing', scope)).toBe(value);
  });
});

describe('parseBuildGroups — ownedStock / ownedStockScope', () => {
  it('keeps a group whose ledger and scope are well-formed', () => {
    const raw = {
      1: [
        {
          id: 'g1',
          name: 'G',
          order: 0,
          ownedStock: { 34: 100, 35: 0 },
          ownedStockScope: { mode: 'everywhere' },
        },
      ],
    };
    expect(parseBuildGroups(raw)).toEqual({
      1: [
        {
          id: 'g1',
          name: 'G',
          order: 0,
          ownedStock: { 34: 100, 35: 0 },
          ownedStockScope: { mode: 'everywhere' },
        },
      ],
    });
  });

  it('drops a group whose ledger holds a negative or non-finite quantity', () => {
    const raw = { 1: [{ id: 'g1', name: 'G', order: 0, ownedStock: { 34: -1 } }] };
    expect(parseBuildGroups(raw)).toEqual({});
  });

  it('drops a group whose ledger key is not a typeID', () => {
    const raw = { 1: [{ id: 'g1', name: 'G', order: 0, ownedStock: { notANumber: 1 } }] };
    expect(parseBuildGroups(raw)).toEqual({});
  });

  it('drops a group whose scope is malformed', () => {
    const raw = { 1: [{ id: 'g1', name: 'G', order: 0, ownedStockScope: { mode: 'bogus' } }] };
    expect(parseBuildGroups(raw)).toEqual({});
  });

  it('keeps a group with neither field at all — the pre-#697 shape', () => {
    const raw = { 1: [{ id: 'g1', name: 'G', order: 0 }] };
    expect(parseBuildGroups(raw)).toEqual({ 1: [{ id: 'g1', name: 'G', order: 0 }] });
  });
});

describe('parseBuildGroups — snapshot', () => {
  it('keeps a group whose snapshot is well-formed', () => {
    const raw = { 1: [{ id: 'g1', name: 'G', order: 0, snapshot: snapshot() }] };
    expect(parseBuildGroups(raw)).toEqual({
      1: [{ id: 'g1', name: 'G', order: 0, snapshot: snapshot() }],
    });
  });

  it('drops a group whose snapshot is malformed, rather than keeping the group without it', () => {
    // A half-written snapshot is worse than none: silently dropping just the
    // snapshot would apply the pilot's Retarget to nothing and never say so.
    const raw = { 1: [{ id: 'g1', name: 'G', order: 0, snapshot: { hubId: 'jita' } }] };
    expect(parseBuildGroups(raw)).toEqual({});
  });

  it('drops a snapshot whose buildSystemId/buildSystemName is a half-pair', () => {
    const raw = {
      1: [{ id: 'g1', name: 'G', order: 0, snapshot: snapshot({ buildSystemId: 30000142 }) }],
    };
    expect(parseBuildGroups(raw)).toEqual({});
  });

  it('keeps a group with no snapshot at all — the pre-#632 shape', () => {
    const raw = { 1: [{ id: 'g1', name: 'G', order: 0 }] };
    expect(parseBuildGroups(raw)).toEqual({ 1: [{ id: 'g1', name: 'G', order: 0 }] });
  });
});
