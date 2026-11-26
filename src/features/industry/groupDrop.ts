const GROUP_PREFIX = 'build-group-drop:group:';
const PLAN_PREFIX = 'build-group-drop:plan:';

export function groupDropId(groupId: string): string {
  return `${GROUP_PREFIX}${groupId}`;
}

export function planDropId(planId: string): string {
  return `${PLAN_PREFIX}${planId}`;
}

export function planIdFromDropId(id: string): string | null {
  return id.startsWith(PLAN_PREFIX) ? id.slice(PLAN_PREFIX.length) : null;
}

function dropTargetGroupId(
  overId: string | null | undefined,
  groupOfPlan: ReadonlyMap<string, string>
): string | null | undefined {
  if (overId == null) return undefined;
  if (overId.startsWith(GROUP_PREFIX)) return overId.slice(GROUP_PREFIX.length);
  const planId = planIdFromDropId(overId);
  if (planId === null) return undefined;
  return groupOfPlan.get(planId) ?? null;
}

export interface PlanGroupMove {
  planId: string;
  groupId: string | null;
}

export function resolveGroupDrop(
  activeId: string,
  overId: string | null | undefined,
  groupOfPlan: ReadonlyMap<string, string>
): PlanGroupMove | null {
  const planId = planIdFromDropId(activeId);
  if (planId === null) return null;
  const target = dropTargetGroupId(overId, groupOfPlan);
  if (target === undefined) return null;
  const current = groupOfPlan.get(planId) ?? null;
  return current === target ? null : { planId, groupId: target };
}
