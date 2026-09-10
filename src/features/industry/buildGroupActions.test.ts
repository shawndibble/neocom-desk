import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, type BuildPlanRecord } from '@/db';
import type { BuildGroupSnapshot, BuildGroupsValue } from './buildGroups';
import { deleteBuildGroup, moveBuildPlanToGroup, retargetBuildGroup } from './buildGroupActions';

function plan(overrides: Partial<BuildPlanRecord> & { id: string }): BuildPlanRecord {
  return {
    characterId: 1,
    name: 'Plan',
    blueprintTypeID: 100,
    runs: 1,
    me: 0,
    te: 0,
    facility: 'npcStation',
    rigLevel: 'none',
    security: 'highsec',
    hubId: 'jita',
    updatedAt: 0,
    ...overrides,
  };
}

function writeContext(overrides: { buildGroups?: BuildGroupsValue } = {}) {
  return {
    characterId: 1,
    buildGroups: overrides.buildGroups ?? {},
    setBuildGroups: vi.fn<(value: BuildGroupsValue) => Promise<void>>(() => Promise.resolve()),
  };
}

beforeEach(async () => {
  await db.buildPlans.clear();
});

describe('deleteBuildGroup', () => {
  it('strips buildGroupId from every member before removing the group', async () => {
    await db.buildPlans.bulkAdd([
      plan({ id: 'p1', buildGroupId: 'g1' }),
      plan({ id: 'p2', buildGroupId: 'g1' }),
    ]);
    const members = [
      plan({ id: 'p1', buildGroupId: 'g1' }),
      plan({ id: 'p2', buildGroupId: 'g1' }),
    ];
    const ctx = writeContext();

    await deleteBuildGroup('g1', members, ctx);

    const stored = await db.buildPlans.bulkGet(['p1', 'p2']);
    expect(stored.every((p) => p && !('buildGroupId' in p))).toBe(true);
  });

  it('writes the group removal after orphaning members, not before', async () => {
    await db.buildPlans.bulkAdd([plan({ id: 'p1', buildGroupId: 'g1' })]);
    const members = [plan({ id: 'p1', buildGroupId: 'g1' })];
    const calls: string[] = [];
    const ctx = writeContext();
    ctx.setBuildGroups.mockImplementation(async () => {
      calls.push('group');
    });
    const originalBulkPut = db.buildPlans.bulkPut.bind(db.buildPlans);
    const bulkPut = vi.spyOn(db.buildPlans, 'bulkPut').mockImplementation(((
      items: readonly BuildPlanRecord[]
    ) => {
      calls.push('members');
      return originalBulkPut(items);
    }) as typeof db.buildPlans.bulkPut);

    await deleteBuildGroup('g1', members, ctx);

    expect(calls).toEqual(['members', 'group']);
    bulkPut.mockRestore();
  });

  it('skips the plan transaction entirely for an empty group', async () => {
    const ctx = writeContext();
    const bulkPut = vi.spyOn(db.buildPlans, 'bulkPut');

    await deleteBuildGroup('g1', [], ctx);

    expect(bulkPut).not.toHaveBeenCalled();
    expect(ctx.setBuildGroups).toHaveBeenCalledTimes(1);
    bulkPut.mockRestore();
  });

  it('removes the group from the given character only', async () => {
    const ctx = writeContext({
      buildGroups: { 1: [{ id: 'g1', name: 'Group', order: 0 }] },
    });

    await deleteBuildGroup('g1', [], ctx);

    const [value] = ctx.setBuildGroups.mock.calls[0];
    expect(value[1] ?? []).toEqual([]);
  });
});

describe('moveBuildPlanToGroup', () => {
  it('sets the plan onto the given group', async () => {
    await db.buildPlans.add(plan({ id: 'p1' }));

    await moveBuildPlanToGroup('p1', 'g2', 1);

    const stored = await db.buildPlans.get('p1');
    expect(stored?.buildGroupId).toBe('g2');
  });

  it('clears the group when moving out to null', async () => {
    await db.buildPlans.add(plan({ id: 'p1', buildGroupId: 'g1' }));

    await moveBuildPlanToGroup('p1', null, 1);

    const stored = await db.buildPlans.get('p1');
    expect(stored && 'buildGroupId' in stored).toBe(false);
  });

  it('bumps updatedAt on the moved plan', async () => {
    await db.buildPlans.add(plan({ id: 'p1', updatedAt: 0 }));

    await moveBuildPlanToGroup('p1', 'g2', 1);

    const stored = await db.buildPlans.get('p1');
    expect(stored?.updatedAt).toBeGreaterThan(0);
  });

  it('does nothing when the plan no longer exists', async () => {
    await expect(moveBuildPlanToGroup('missing', 'g2', 1)).resolves.toBeUndefined();
    expect(await db.buildPlans.get('missing')).toBeUndefined();
  });
});

describe('retargetBuildGroup', () => {
  const target: Omit<BuildGroupSnapshot, 'appliedAt'> = {
    hubId: 'amarr',
    facility: 'npcStation',
    security: 'highsec',
  };

  it('applies the retarget patch to every listed plan', async () => {
    await db.buildPlans.bulkAdd([
      plan({ id: 'p1', hubId: 'jita', facility: 'npcStation', security: 'highsec' }),
      plan({ id: 'p2', hubId: 'jita', facility: 'npcStation', security: 'highsec' }),
    ]);
    const ctx = writeContext();

    await retargetBuildGroup('g1', target, ['p1', 'p2'], ctx);

    const stored = await db.buildPlans.bulkGet(['p1', 'p2']);
    expect(stored.every((p) => p?.hubId === 'amarr')).toBe(true);
  });

  it('skips the plan write entirely when no plans are checked', async () => {
    const ctx = writeContext();
    const bulkPut = vi.spyOn(db.buildPlans, 'bulkPut');

    await retargetBuildGroup('g1', target, [], ctx);

    expect(bulkPut).not.toHaveBeenCalled();
    bulkPut.mockRestore();
  });

  it('always writes the group snapshot, even with no plans checked', async () => {
    const ctx = writeContext({
      buildGroups: { 1: [{ id: 'g1', name: 'Group', order: 0 }] },
    });

    await retargetBuildGroup('g1', target, [], ctx);

    expect(ctx.setBuildGroups).toHaveBeenCalledTimes(1);
    const [value] = ctx.setBuildGroups.mock.calls[0];
    expect(value[1]?.[0]?.snapshot).toMatchObject(target);
  });
});
