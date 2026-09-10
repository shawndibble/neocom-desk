/**
 * A Build Group's write path for the three operations that touch both a
 * group's own record and its member plans: delete, move a plan in/out, and
 * Retarget. Each function owns its complete side-effect set — transaction
 * shape, write order, and `scheduleSync`/`setBuildGroups` — the same split
 * `fitImport.ts` uses for group creation, so `routes/Industry.tsx` calls a
 * name instead of assembling Dexie transactions itself.
 */
import { db, type BuildPlanRecord } from '@/db';
import { scheduleSync } from '@/sync';
import {
  removeBuildGroup,
  withGroupSnapshot,
  type BuildGroupSnapshot,
  type BuildGroupsValue,
} from './buildGroups';
import { retargetPatch } from './retargetPatch';

export interface BuildGroupWriteContext {
  characterId: number;
  buildGroups: BuildGroupsValue;
  setBuildGroups: (value: BuildGroupsValue) => Promise<void>;
}

/**
 * Deletes a Build Group: orphans its members before removing the group's own
 * record. Write order matters and is owned here — membership goes first and
 * the group's own record last, so the group always outlives what points at
 * it (see `buildGroups.ts`'s module comment). Never cascades to the members
 * themselves; they reappear in the ungrouped list.
 */
export async function deleteBuildGroup(
  groupId: string,
  members: readonly BuildPlanRecord[],
  context: BuildGroupWriteContext
): Promise<void> {
  if (members.length > 0) {
    const now = Date.now();
    await db.transaction('rw', db.buildPlans, async () => {
      const stored = await db.buildPlans.bulkGet(members.map((m) => m.id));
      const orphaned = stored.flatMap((plan) => {
        if (!plan) return [];
        const next = { ...plan, updatedAt: now };
        delete next.buildGroupId;
        return [next];
      });
      await db.buildPlans.bulkPut(orphaned);
    });
    scheduleSync(context.characterId);
  }
  await context.setBuildGroups(removeBuildGroup(context.buildGroups, context.characterId, groupId));
}

/** Moves one plan between groups, or out of every group when `groupId` is null. */
export async function moveBuildPlanToGroup(
  planId: string,
  groupId: string | null,
  characterId: number
): Promise<void> {
  await db.transaction('rw', db.buildPlans, async () => {
    const stored = await db.buildPlans.get(planId);
    if (!stored) return;
    // Read-modify-write inside the transaction, never a whole-record put
    // built on a render's closure — that reverts every field the caller did
    // not mention, which is how `buildHere` used to get wiped.
    const moved = { ...stored, updatedAt: Date.now() };
    // Deleted rather than set to undefined: Firestore rejects undefined at
    // any depth, and `toRemoteDoc` omits the key on `undefined` anyway, so
    // an absent key is the one shape both stores agree on.
    if (groupId === null) delete moved.buildGroupId;
    else moved.buildGroupId = groupId;
    await db.buildPlans.put(moved);
  });
  scheduleSync(characterId);
}

/**
 * Applies a Retarget group's chosen hub/facility/security/build-system to
 * every checked member plan (issue #632), and keeps the group's own snapshot
 * in step so the quick-fill link and the next Retarget both start from what
 * was actually applied — not merely what the form last held. A plain bulk
 * write, not a second source of truth: each patched plan owns its own values
 * from here on, same as any manual edit (see `retargetPatch.ts`).
 */
export async function retargetBuildGroup(
  groupId: string,
  target: Omit<BuildGroupSnapshot, 'appliedAt'>,
  planIds: readonly string[],
  context: BuildGroupWriteContext
): Promise<void> {
  const snapshot: BuildGroupSnapshot = { ...target, appliedAt: Date.now() };
  if (planIds.length > 0) {
    const patch = retargetPatch(snapshot);
    await db.transaction('rw', db.buildPlans, async () => {
      const stored = await db.buildPlans.bulkGet([...planIds]);
      const now = Date.now();
      const updated = stored.flatMap((p) => (p ? [{ ...p, ...patch, updatedAt: now }] : []));
      await db.buildPlans.bulkPut(updated);
    });
    scheduleSync(context.characterId);
  }
  await context.setBuildGroups(
    withGroupSnapshot(context.buildGroups, context.characterId, groupId, snapshot)
  );
}
