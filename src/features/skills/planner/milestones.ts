import { evaluateFitGoal } from '@/engine/fitGoal';
import type { PlanEntry, PlanMilestone, PlanStep } from '@/engine/types';

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

function anchorKey(anchor: Pick<PlanMilestone, 'skillTypeID' | 'level'>): string {
  return `${anchor.skillTypeID}:${anchor.level}`;
}

export function normalizeMilestones(raw: readonly PlanMilestone[] | undefined): PlanMilestone[] {
  const seenAnchors = new Set<string>();
  return (raw ?? [])
    .filter(isPlanMilestoneShape)
    .map((m) => ({ ...m, name: cleanName(m.name) }))
    .filter((m) => m.name !== '')
    .filter((m, i, all) => {
      if (m.fittingId !== undefined) {
        return all.findIndex((other) => other.fittingId === m.fittingId) === i;
      }
      const key = anchorKey(m);
      if (seenAnchors.has(key)) return false;
      seenAnchors.add(key);
      return true;
    });
}

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
