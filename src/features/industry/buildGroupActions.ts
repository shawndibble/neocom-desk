/**
 * A Build Group's write path for the operations that touch both a group's own
 * record and its member plans: delete and Retarget. Each function owns the
 * write order between the group record and its members; the member-plan
 * writes themselves (transaction, `updatedAt`, sync) go through
 * `buildPlanStore.ts`, the same split `fitImport.ts` uses for group creation,
 * so `routes/Industry.tsx` calls a name instead of assembling Dexie
 * transactions itself. Moving one plan between groups is plain
 * `buildPlanStore.moveBuildPlan`.
 */
import type { BuildPlanRecord } from '@/db';
import {
  removeBuildGroup,
  withGroupSnapshot,
  type BuildGroupSnapshot,
  type BuildGroupsValue,
} from './buildGroups';
import { patchBuildPlans } from './buildPlanStore';
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
  // Undefined drops the key: `buildPlanStore`'s patch semantics.
  await patchBuildPlans(
    members.map((m) => m.id),
    { buildGroupId: undefined }
  );
  await context.setBuildGroups(removeBuildGroup(context.buildGroups, context.characterId, groupId));
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
  await patchBuildPlans(planIds, retargetPatch(snapshot));
  await context.setBuildGroups(
    withGroupSnapshot(context.buildGroups, context.characterId, groupId, snapshot)
  );
}
