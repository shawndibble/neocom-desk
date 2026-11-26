import { normalizePlan } from '@/engine/skills/plan';
import type { EngineSkill, PlanEntry, TrainedSkill } from '@/engine/types';

export function normalizeMarkers(
  markers: readonly number[] | undefined,
  entryCount: number
): number[] {
  return [...new Set((markers ?? []).map((m) => Math.min(entryCount, Math.max(0, m))))].sort(
    (a, b) => a - b
  );
}

export function hasKnownSkill(entry: PlanEntry, skills: ReadonlyMap<number, EngineSkill>): boolean {
  return skills.has(entry.skillTypeID);
}

export function markerStepIndices(
  entries: readonly PlanEntry[],
  markers: readonly number[] | undefined,
  skills: ReadonlyMap<number, EngineSkill>,
  trainedSkills: ReadonlyMap<number, TrainedSkill>
): number[] {
  const valid = (list: readonly PlanEntry[]) => list.filter((e) => hasKnownSkill(e, skills));
  return normalizeMarkers(markers, entries.length).map(
    (position) => normalizePlan(valid(entries.slice(0, position)), skills, trainedSkills).length
  );
}
