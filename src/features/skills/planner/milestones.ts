/**
 * Plan Milestone (CONTEXT.md) UI-layer CRUD: `SkillPlanRecord.milestones` is
 * read through `normalizeMilestones` on every read (a malformed or
 * over-length row from an older build or a sync race degrades gracefully
 * rather than corrupting the list), same convention as markers.ts's
 * `normalizeMarkers`. Status against the live schedule (projected / reached /
 * orphaned) is `engine/skillPlanMilestones.ts`'s job, not this module's.
 */
import type { PlanMilestone } from '@/engine/types';

/** Beyond this a name reads as a paragraph, not a goal label. */
export const MAX_MILESTONE_NAME_LENGTH = 60;

function isPlanMilestoneShape(value: unknown): value is PlanMilestone {
  if (typeof value !== 'object' || value === null) return false;
  const m = value as Partial<Record<keyof PlanMilestone, unknown>>;
  return (
    typeof m.id === 'string' &&
    typeof m.name === 'string' &&
    typeof m.skillTypeID === 'number' &&
    typeof m.level === 'number' &&
    m.level >= 1 &&
    m.level <= 5
  );
}

function cleanName(name: string): string {
  return name.trim().slice(0, MAX_MILESTONE_NAME_LENGTH);
}

/** `engine/skillPlanMilestones.ts` looks a milestone up by this same (skillTypeID, level) pair — two milestones sharing one would collapse to whichever the lookup map kept. */
function anchorKey(anchor: Pick<PlanMilestone, 'skillTypeID' | 'level'>): string {
  return `${anchor.skillTypeID}:${anchor.level}`;
}

/**
 * Read-side clamp: drop malformed rows, trim names, cap their length, and
 * collapse two milestones sharing an anchor to the first — a sync race or a
 * pre-upsert write (see `addMilestone`) should never leave a second one that
 * the by-anchor status lookup would then silently swallow.
 */
export function normalizeMilestones(raw: readonly PlanMilestone[] | undefined): PlanMilestone[] {
  const seenAnchors = new Set<string>();
  return (raw ?? [])
    .filter(isPlanMilestoneShape)
    .map((m) => ({ ...m, name: cleanName(m.name) }))
    .filter((m) => m.name !== '')
    .filter((m) => {
      const key = anchorKey(m);
      if (seenAnchors.has(key)) return false;
      seenAnchors.add(key);
      return true;
    });
}

/**
 * "Add milestone…": names a new goal anchored to one entry row's skill/level.
 * An upsert, not a bare append — the UI only ever offers "Add" on a row with
 * none, but replacing whatever already sits at that anchor (rather than
 * appending a second one) keeps that an invariant rather than a UI courtesy.
 */
export function addMilestone(
  milestones: readonly PlanMilestone[] | undefined,
  anchor: { skillTypeID: number; level: number },
  name: string
): PlanMilestone[] {
  const trimmed = cleanName(name);
  const normalized = normalizeMilestones(milestones).filter(
    (m) => anchorKey(m) !== anchorKey(anchor)
  );
  if (!trimmed) return normalized;
  return [...normalized, { id: crypto.randomUUID(), name: trimmed, ...anchor }];
}

/** A blank rename leaves the existing name in place rather than clearing it. */
export function renameMilestone(
  milestones: readonly PlanMilestone[] | undefined,
  id: string,
  name: string
): PlanMilestone[] {
  const trimmed = cleanName(name);
  return normalizeMilestones(milestones).map((m) =>
    m.id === id && trimmed ? { ...m, name: trimmed } : m
  );
}

export function removeMilestone(
  milestones: readonly PlanMilestone[] | undefined,
  id: string
): PlanMilestone[] {
  return normalizeMilestones(milestones).filter((m) => m.id !== id);
}
