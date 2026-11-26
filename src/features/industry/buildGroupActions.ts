import type { BuildPlanRecord } from '@/db';
import {
  removeBuildGroup,
  withGroupSnapshot,
  type BuildGroupSnapshot,
  type BuildGroupsValue,
} from './buildGroups';
import { markBuildPlansDeleted } from '@/sync';
import { patchBuildPlans } from './buildPlanStore';
import { retargetPatch } from './retargetPatch';

export interface BuildGroupWriteContext {
  characterId: number;
  buildGroups: BuildGroupsValue;
  setBuildGroups: (value: BuildGroupsValue) => Promise<void>;
}

export async function deleteBuildGroup(
  groupId: string,
  members: readonly BuildPlanRecord[],
  context: BuildGroupWriteContext
): Promise<void> {
  await markBuildPlansDeleted(
    context.characterId,
    members.map((m) => m.id)
  );
  await context.setBuildGroups(removeBuildGroup(context.buildGroups, context.characterId, groupId));
}

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
