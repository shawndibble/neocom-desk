/**
 * Remap Marker (CONTEXT.md) position math that the Skill Plan schedule needs:
 * a marker at entry-list position p means "remap before entries[p]". Lives in
 * the engine (not planner/markers.ts, which also carries the drag helpers) so
 * `skillPlanSchedule.ts` can use it and stay pure.
 */
import { normalizePlan } from '@/engine/plan';
import type { EngineSkill, PlanEntry, TrainedSkill } from '@/engine/types';

/** Clamp to [0, entryCount], sort ascending, dedupe. */
export function normalizeMarkers(
  markers: readonly number[] | undefined,
  entryCount: number
): number[] {
  return [...new Set((markers ?? []).map((m) => Math.min(entryCount, Math.max(0, m))))].sort(
    (a, b) => a - b
  );
}

/** An entry whose skill is missing from the catalog contributes no step — the same filter the Skill Plan schedule applies. Shared so markerStepIndices and segmentsToMarkers can't drift on what "missing from the catalog" means. */
export function hasKnownSkill(entry: PlanEntry, skills: ReadonlyMap<number, EngineSkill>): boolean {
  return skills.has(entry.skillTypeID);
}

/**
 * Marker <-> step mapping: a marker at entry-list position p means "remap
 * before entries[p]", which in the computed queue is the step right after
 * everything entries[0..p) expand to. normalizePlan builds steps entry by
 * entry (prereqs recursively, already-planned/trained levels skipped), so the
 * expansion of a strict entry prefix IS a strict step prefix of the full
 * queue — the marker's step index is simply that prefix's length. Entries
 * missing from the catalog are dropped first, mirroring the computed queue's
 * own filtering.
 */
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
