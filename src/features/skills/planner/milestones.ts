/**
 * Plan Milestone (GLOSSARY.md) UI-layer CRUD: `SkillPlanRecord.milestones` is
 * read through `normalizeMilestones` on every read (a malformed or
 * over-length row from an older build or a sync race degrades gracefully
 * rather than corrupting the list), same convention as markers.ts's
 * `normalizeMarkers`. Status against the live schedule (projected / reached /
 * orphaned) is `engine/skillPlanMilestones.ts`'s job, not this module's.
 */
import { evaluateFitGoal } from '@/engine/fitGoal';
import type { PlanEntry, PlanMilestone, PlanStep } from '@/engine/types';

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
    .filter((m, i, all) => {
      // Fit goals share anchors freely (two Fittings can finish on one skill),
      // so they dedupe by Fitting instead.
      if (m.fittingId !== undefined) {
        return all.findIndex((other) => other.fittingId === m.fittingId) === i;
      }
      const key = anchorKey(m);
      if (seenAnchors.has(key)) return false;
      seenAnchors.add(key);
      return true;
    });
}

/**
 * "Add milestone": names a new goal anchored to one entry row's skill/level.
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

/** Adds a goal for a saved Fitting, or moves the existing one for it to `anchor`; never a second per Fitting. */
export function upsertFitGoal(
  milestones: readonly PlanMilestone[] | undefined,
  fitting: { id: string; name: string },
  anchor: PlanStep
): PlanMilestone[] {
  const name = cleanName(fitting.name) || fitting.name;
  const normalized = normalizeMilestones(milestones);
  const existing = normalized.find((m) => m.fittingId === fitting.id);
  const next: PlanMilestone = {
    id: existing?.id ?? crypto.randomUUID(),
    name,
    skillTypeID: anchor.skillTypeID,
    level: anchor.level,
    fittingId: fitting.id,
  };
  return existing ? normalized.map((m) => (m === existing ? next : m)) : [...normalized, next];
}

/**
 * Re-points every fit goal at the latest step its Fitting needs in the plan's
 * current order, and renames it after the Fitting. Returns `milestones`
 * itself when nothing moved. A fit goal whose Fitting isn't in `fits`
 * (deleted, still loading, undecodable) or whose needs the plan no longer
 * covers is left alone; PlanEditor marks the uncovered ones orphaned.
 */
export function reanchorFitGoals(
  milestones: readonly PlanMilestone[] | undefined,
  fits: ReadonlyMap<string, { name: string; needed: readonly PlanEntry[] }>,
  trainedLevels: ReadonlyMap<number, number>,
  steps: readonly PlanStep[]
): readonly PlanMilestone[] | undefined {
  if (!milestones) return milestones;
  let changed = false;
  const next = milestones.map((m) => {
    const fit = m.fittingId === undefined ? undefined : fits.get(m.fittingId);
    if (!fit) return m;
    const goal = evaluateFitGoal(fit.needed, trainedLevels, steps);
    const anchor = goal.state === 'in-plan' ? goal.anchor : null;
    const name = cleanName(fit.name) || m.name;
    const moved =
      anchor !== null && (anchor.skillTypeID !== m.skillTypeID || anchor.level !== m.level);
    if (!moved && name === m.name) return m;
    changed = true;
    return {
      ...m,
      name,
      ...(moved ? { skillTypeID: anchor.skillTypeID, level: anchor.level } : {}),
    };
  });
  return changed ? next : milestones;
}
