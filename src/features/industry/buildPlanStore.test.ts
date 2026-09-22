import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, type BuildPlanRecord } from '@/db';
import { scheduleSync } from '@/sync';
import { buildPlanTombstonesKey, readTombstones } from '@/sync/localBookkeeping';
import {
  applyBuildPlanChange,
  createBuildPlans,
  duplicateBuildPlan,
  moveBuildPlan,
  patchBuildPlans,
  removeBuildPlan,
} from './buildPlanStore';

vi.mock('@/sync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/sync')>()),
  scheduleSync: vi.fn(),
}));

const syncCalls = vi.mocked(scheduleSync);

function plan(overrides: Partial<BuildPlanRecord> & { id: string }): BuildPlanRecord {
  return {
    characterId: 1,
    name: 'Rifter',
    blueprintTypeID: 683,
    runs: 1,
    me: 0,
    te: 0,
    facility: 'npcStation',
    rigLevel: 'none',
    security: 'highsec',
    hubId: 'jita',
    updatedAt: 1,
    ...overrides,
  };
}

beforeEach(async () => {
  await db.buildPlans.clear();
  await db.settings.clear();
  syncCalls.mockClear();
});

describe('createBuildPlans', () => {
  it('adds every plan and schedules one sync', async () => {
    await createBuildPlans([plan({ id: 'a' }), plan({ id: 'b' })]);
    expect(await db.buildPlans.count()).toBe(2);
    expect(syncCalls).toHaveBeenCalledTimes(1);
    expect(syncCalls).toHaveBeenCalledWith(1);
  });

  it('writes and syncs nothing for an empty batch', async () => {
    await createBuildPlans([]);
    expect(syncCalls).not.toHaveBeenCalled();
  });
});

describe('duplicateBuildPlan', () => {
  it('copies the plan under a new id, name and fresh updatedAt', async () => {
    const source = plan({ id: 'a', runs: 7 });
    await db.buildPlans.add(source);
    const id = await duplicateBuildPlan(source, 'Rifter (copy)');
    const copy = await db.buildPlans.get(id);
    expect(id).not.toBe('a');
    expect(copy).toMatchObject({ name: 'Rifter (copy)', runs: 7, characterId: 1 });
    expect(copy!.updatedAt).toBeGreaterThan(source.updatedAt);
    expect(syncCalls).toHaveBeenCalledTimes(1);
  });
});

describe('applyBuildPlanChange', () => {
  beforeEach(async () => {
    await db.buildPlans.add(plan({ id: 'p', buildLocationId: 5, buildLocationName: 'Raitaru' }));
  });

  it('an edit merges the patch, bumps updatedAt and schedules one sync', async () => {
    await applyBuildPlanChange('p', { kind: 'edit', patch: { runs: 10 } });
    const stored = await db.buildPlans.get('p');
    expect(stored).toMatchObject({ runs: 10, name: 'Rifter', buildLocationId: 5 });
    expect(stored!.updatedAt).toBeGreaterThan(1);
    expect(syncCalls).toHaveBeenCalledTimes(1);
    expect(syncCalls).toHaveBeenCalledWith(1);
  });

  it('a derived fix persists without bumping updatedAt', async () => {
    await applyBuildPlanChange('p', { kind: 'derived', patch: { security: 'lowsec' } });
    const stored = await db.buildPlans.get('p');
    expect(stored?.security).toBe('lowsec');
    expect(stored?.updatedAt).toBe(1);
    expect(syncCalls).toHaveBeenCalledTimes(1);
  });

  it('an undefined patch member removes the key rather than storing undefined', async () => {
    await applyBuildPlanChange('p', {
      kind: 'edit',
      patch: { buildLocationId: undefined, buildLocationName: undefined },
    });
    const stored = await db.buildPlans.get('p');
    expect(stored && 'buildLocationId' in stored).toBe(false);
    expect(stored && 'buildLocationName' in stored).toBe(false);
  });

  it('does nothing — no write, no sync — for a plan deleted mid-edit', async () => {
    await db.buildPlans.delete('p');
    await applyBuildPlanChange('p', { kind: 'edit', patch: { runs: 10 } });
    expect(await db.buildPlans.get('p')).toBeUndefined();
    expect(syncCalls).not.toHaveBeenCalled();
  });

  describe('sourcing', () => {
    it('merges the edit onto the stored map and bumps updatedAt', async () => {
      await applyBuildPlanChange('p', {
        kind: 'sourcing',
        edits: [{ typeID: 34, patch: { ownedQuantity: 400 } }],
      });
      const stored = await db.buildPlans.get('p');
      expect(stored?.materialSourcing).toEqual({ 34: { ownedQuantity: 400 } });
      expect(stored!.updatedAt).toBeGreaterThan(1);
      expect(syncCalls).toHaveBeenCalledTimes(1);
    });

    it('merges against the stored record, so a second edit cannot drop the first', async () => {
      // Both edits are issued from the same rendered map (the empty one) — the
      // real hazard when tabbing straight from a row's owned quantity into its
      // override price, before the live query has re-emitted.
      await Promise.all([
        applyBuildPlanChange('p', {
          kind: 'sourcing',
          edits: [{ typeID: 34, patch: { ownedQuantity: 400 } }],
        }),
        applyBuildPlanChange('p', {
          kind: 'sourcing',
          edits: [{ typeID: 34, patch: { overridePrice: 7 } }],
        }),
      ]);
      const stored = await db.buildPlans.get('p');
      expect(stored?.materialSourcing).toEqual({ 34: { ownedQuantity: 400, overridePrice: 7 } });
    });

    it('applies several edits in one write and one sync', async () => {
      await applyBuildPlanChange('p', {
        kind: 'sourcing',
        edits: [
          { typeID: 34, patch: { ownedQuantity: 400 } },
          { typeID: 35, patch: { ownedQuantity: 20 } },
          { typeID: 34, patch: { overridePrice: 7 } },
        ],
      });
      const stored = await db.buildPlans.get('p');
      expect(stored?.materialSourcing).toEqual({
        34: { ownedQuantity: 400, overridePrice: 7 },
        35: { ownedQuantity: 20 },
      });
      expect(syncCalls).toHaveBeenCalledTimes(1);
    });

    it('writes and syncs nothing for an empty edit list', async () => {
      await applyBuildPlanChange('p', { kind: 'sourcing', edits: [] });
      expect((await db.buildPlans.get('p'))?.updatedAt).toBe(1);
      expect(syncCalls).not.toHaveBeenCalled();
    });

    it('clears the field back off the record, leaving no empty map behind', async () => {
      await applyBuildPlanChange('p', {
        kind: 'sourcing',
        edits: [{ typeID: 34, patch: { overridePrice: 7 } }],
      });
      await applyBuildPlanChange('p', {
        kind: 'sourcing',
        edits: [{ typeID: 34, patch: { overridePrice: undefined } }],
      });
      const stored = await db.buildPlans.get('p');
      expect(stored && 'materialSourcing' in stored).toBe(false);
    });
  });
});

describe('patchBuildPlans', () => {
  it('patches every listed plan, bumps updatedAt, and schedules one sync', async () => {
    await db.buildPlans.bulkAdd([plan({ id: 'a' }), plan({ id: 'b' }), plan({ id: 'c' })]);
    await patchBuildPlans(['a', 'b'], { hubId: 'amarr' });
    const [a, b, c] = await db.buildPlans.bulkGet(['a', 'b', 'c']);
    expect(a).toMatchObject({ hubId: 'amarr' });
    expect(b).toMatchObject({ hubId: 'amarr' });
    expect(a!.updatedAt).toBeGreaterThan(1);
    expect(c).toMatchObject({ hubId: 'jita', updatedAt: 1 });
    expect(syncCalls).toHaveBeenCalledTimes(1);
  });

  it('takes a per-plan patch, skipping plans it returns null for', async () => {
    await db.buildPlans.bulkAdd([plan({ id: 'a' }), plan({ id: 'b' })]);
    await patchBuildPlans(['a', 'b'], (p) => (p.id === 'a' ? { buildHere: [34] } : null));
    const [a, b] = await db.buildPlans.bulkGet(['a', 'b']);
    expect(a?.buildHere).toEqual([34]);
    expect(b?.updatedAt).toBe(1);
  });

  it('skips missing plans and syncs nothing when nothing was written', async () => {
    await patchBuildPlans(['gone'], { hubId: 'amarr' });
    expect(await db.buildPlans.count()).toBe(0);
    expect(syncCalls).not.toHaveBeenCalled();
  });
});

describe('moveBuildPlan', () => {
  it('sets the group and bumps updatedAt', async () => {
    await db.buildPlans.add(plan({ id: 'a' }));
    await moveBuildPlan('a', 'g1');
    const stored = await db.buildPlans.get('a');
    expect(stored?.buildGroupId).toBe('g1');
    expect(stored!.updatedAt).toBeGreaterThan(1);
    expect(syncCalls).toHaveBeenCalledTimes(1);
  });

  it('removes the key entirely when moving out of every group', async () => {
    await db.buildPlans.add(plan({ id: 'a', buildGroupId: 'g1' }));
    await moveBuildPlan('a', null);
    const stored = await db.buildPlans.get('a');
    expect(stored && 'buildGroupId' in stored).toBe(false);
  });
});

describe('removeBuildPlan', () => {
  it('deletes the row and records a tombstone so the deletion syncs', async () => {
    await db.buildPlans.add(plan({ id: 'a' }));
    await removeBuildPlan(1, 'a');
    expect(await db.buildPlans.get('a')).toBeUndefined();
    const tombstones = await readTombstones(buildPlanTombstonesKey(1));
    expect(tombstones.map((t) => t.id)).toEqual(['a']);
  });
});
