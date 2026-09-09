/**
 * Where a dragged **Build Plan** lands when it is dropped on the plan list
 * (issue #627) — the whole of that decision, with no dnd-kit types in sight.
 *
 * `BuildPlanList` is the repo's first *multi-container* drag: the thing being
 * dragged can leave the container it started in. That makes "what did this
 * drop mean?" a real question with several wrong answers (a no-op move that
 * still writes to Dexie and bumps `updatedAt`; a drop on a group header
 * resolving to the plan under it), so it lives here as plain string-and-Map
 * logic that a unit test can exercise every branch of. The component is left
 * with wiring only.
 *
 * `planDrop.ts` (the Skill Plan list's drop resolution) is the same idea and
 * shares none of its content — that one promotes a prereq row inside one flat
 * ordered array, which is a different question entirely.
 *
 * ## Two prefixes, not one id space
 *
 * A group's droppable id and a plan's draggable id are both arbitrary strings
 * chosen elsewhere (`crypto.randomUUID()` today, but neither is this module's
 * to assume), so they need prefixing before they can share dnd-kit's one id
 * space. Prefixes are stripped with an explicit `startsWith` + `slice` rather
 * than a `split(':')`, so a plan whose own id contains the separator still
 * round-trips.
 */

const GROUP_PREFIX = 'build-group-drop:group:';
const PLAN_PREFIX = 'build-group-drop:plan:';

/** The droppable id for a group's header row — a drop target that holds no sortable of its own, and the *only* target a collapsed group has. */
export function groupDropId(groupId: string): string {
  return `${GROUP_PREFIX}${groupId}`;
}

/** The id a plan row registers as, both draggable and droppable: dropping on a row means "into whatever group that row is in". */
export function planDropId(planId: string): string {
  return `${PLAN_PREFIX}${planId}`;
}

/** The plan behind a `planDropId`, or null for any other id. */
export function planIdFromDropId(id: string): string | null {
  return id.startsWith(PLAN_PREFIX) ? id.slice(PLAN_PREFIX.length) : null;
}

/**
 * Which group a drop on `overId` lands in: the group's id, `null` for the
 * ungrouped list, or `undefined` when `overId` is not one of this list's drop
 * targets at all (the drag ended outside the list, or over nothing).
 *
 * `null` and `undefined` are deliberately different answers — the first is a
 * move that clears `buildGroupId`, the second is not a move.
 *
 * `groupOfPlan` maps a plan id to the group it renders under, absent meaning
 * ungrouped. It is built from the same split the list draws, so a plan whose
 * group no longer exists reads as ungrouped here exactly as it looks on
 * screen.
 */
export function dropTargetGroupId(
  overId: string | null | undefined,
  groupOfPlan: ReadonlyMap<string, string>
): string | null | undefined {
  if (overId == null) return undefined;
  if (overId.startsWith(GROUP_PREFIX)) return overId.slice(GROUP_PREFIX.length);
  const planId = planIdFromDropId(overId);
  if (planId === null) return undefined;
  return groupOfPlan.get(planId) ?? null;
}

/** A plan to move, and the group to move it into — `null` meaning out of every group. */
export interface PlanGroupMove {
  planId: string;
  groupId: string | null;
}

/**
 * The move a completed drag implies, or `null` when it implies none: dropped
 * outside the list, dropped on itself, or dropped back into the group it was
 * already in. Every one of those reaches `onDragEnd` as an ordinary drop, and
 * writing them through would touch Dexie and bump `updatedAt` for nothing.
 */
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
