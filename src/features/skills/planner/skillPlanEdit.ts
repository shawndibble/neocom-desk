import type { SkillPlanRecord } from '@/db';
import { normalizePlan } from '@/engine/skills/plan';
import { optimizeAtMarkers } from '@/engine/optimizer';
import type { BoosterContext, RemapSegment } from '@/engine/optimizer';
import { hasKnownSkill } from '@/engine/remapMarkers';
import type {
  Attributes,
  CloneState,
  EngineSkill,
  Implants,
  PlanEntry,
  PlanPriority,
  PlanStep,
  TrainedSkill,
} from '@/engine/types';
import {
  markerStepIndices,
  normalizeMarkerAttributes,
  normalizeMarkers,
  segmentsToMarkers,
} from './markers';
import { planDrop, promotePrereq, type PlanDropResult, type PlanDropState } from './planDrop';
import type { MergedRow } from './queueRows';
import {
  appendImportedEntries,
  applyReorderSuggestion,
  setEntryPriority,
  upsertEntry,
  removeEntry as withoutEntry,
} from './reorder';
import { splitEntriesByLevel } from './splitEntries';

export type SkillPlanEditable = Pick<SkillPlanRecord, 'entries' | 'markers' | 'markerAttributes'>;

export type SkillPlanPatch = Partial<SkillPlanEditable>;

export function alignedMarkerAttributes(plan: SkillPlanEditable): (Attributes | null)[] {
  return normalizeMarkerAttributes(plan.markers, plan.markerAttributes, plan.entries.length);
}

export function addEntry(plan: SkillPlanEditable, entry: PlanEntry): SkillPlanPatch {
  return { entries: upsertEntry(plan.entries, entry) };
}

export function setPriority(
  plan: SkillPlanEditable,
  skillTypeID: number,
  priority: PlanPriority
): SkillPlanPatch {
  return { entries: setEntryPriority(plan.entries, skillTypeID, priority) };
}

export function appendImport(
  plan: SkillPlanEditable,
  imported: readonly PlanEntry[]
): SkillPlanPatch {
  return { entries: appendImportedEntries(plan.entries, imported) };
}

export function applyReorder(
  plan: SkillPlanEditable,
  suggestedSteps: readonly PlanStep[]
): SkillPlanPatch {
  return { entries: applyReorderSuggestion(plan.entries, suggestedSteps) };
}

export function addRemapMarker(plan: SkillPlanEditable): SkillPlanPatch {
  const entryCount = plan.entries.length;
  const markers = [...(plan.markers ?? []), entryCount];
  return {
    markers: normalizeMarkers(markers, entryCount),
    markerAttributes: normalizeMarkerAttributes(
      markers,
      [...(plan.markerAttributes ?? []), null],
      entryCount
    ),
  };
}

export function removeRemapMarker(plan: SkillPlanEditable, markerIndex: number): SkillPlanPatch {
  const markers = normalizeMarkers(plan.markers, plan.entries.length);
  const markerAttributes = alignedMarkerAttributes(plan);
  markers.splice(markerIndex, 1);
  markerAttributes.splice(markerIndex, 1);
  return { markers, markerAttributes };
}

export function setRemapMarkerAttributes(
  plan: SkillPlanEditable,
  markerIndex: number,
  attributes: Attributes | null
): SkillPlanPatch {
  const markerAttributes = alignedMarkerAttributes(plan);
  markerAttributes[markerIndex] = attributes;
  return { markerAttributes };
}

function dropPatch(plan: SkillPlanEditable, state: PlanDropState): SkillPlanPatch {
  const before = alignedMarkerAttributes(plan);
  return {
    entries: state.entries,
    markers: state.markers,
    markerAttributes: state.markerOrder.map((oldOrdinal) => before[oldOrdinal] ?? null),
  };
}

export type MoveRowRefusal = Extract<PlanDropResult, { ok: false }>;

export type MoveRowResult =
  | {
      ok: true;
      patch: SkillPlanPatch;
      promoted: { skillTypeID: number; level: number } | null;
    }
  | MoveRowRefusal;

export function moveRow(
  plan: SkillPlanEditable,
  move: {
    rows: readonly MergedRow[];
    activeId: string;
    overId: string;
    skills: ReadonlyMap<number, EngineSkill>;
    trainedSkills: ReadonlyMap<number, TrainedSkill>;
  }
): MoveRowResult {
  const result = planDrop({ entries: plan.entries, markers: plan.markers, ...move });
  if (!result.ok) return result;
  return { ok: true, patch: dropPatch(plan, result), promoted: result.promoted };
}

export function promotePrereqRow(
  plan: SkillPlanEditable,
  rows: readonly MergedRow[],
  rowId: string
): SkillPlanPatch | null {
  const result = promotePrereq({ entries: plan.entries, markers: plan.markers, rows, rowId });
  return result ? dropPatch(plan, result) : null;
}

export function replaceWithImport(
  plan: SkillPlanEditable,
  imported: readonly PlanEntry[]
): { patch: SkillPlanPatch; undo: Required<SkillPlanEditable> } {
  return {
    patch: { entries: [...imported], markers: [], markerAttributes: [] },
    undo: {
      entries: plan.entries,
      markers: plan.markers ?? [],
      markerAttributes: plan.markerAttributes ?? [],
    },
  };
}

export interface RemapPricingContext {
  currentAttributes: Attributes;
  implants?: Implants;
  cloneState?: CloneState;
  booster?: BoosterContext;
}

function attributesEqual(a: Attributes, b: Attributes): boolean {
  return (
    a.intelligence === b.intelligence &&
    a.memory === b.memory &&
    a.perception === b.perception &&
    a.willpower === b.willpower &&
    a.charisma === b.charisma
  );
}

function dropRedundantMarkers(
  entries: readonly PlanEntry[],
  markers: readonly number[],
  skills: ReadonlyMap<number, EngineSkill>,
  trainedSkills: ReadonlyMap<number, TrainedSkill>,
  pricing: RemapPricingContext
): number[] {
  if (markers.length === 0) return markers as number[];
  const knownEntries = entries.filter((e) => hasKnownSkill(e, skills));
  const steps = normalizePlan(knownEntries, skills, trainedSkills);
  const stepIndices = markerStepIndices(entries, markers, skills, trainedSkills);
  const resolved = optimizeAtMarkers(steps, skills, {
    markers: stepIndices,
    currentAttributes: pricing.currentAttributes,
    implants: pricing.implants,
    cloneState: pricing.cloneState,
    booster: pricing.booster,
  });
  const markersByStep = new Map<number, number[]>();
  markers.forEach((marker, i) => {
    const step = stepIndices[i];
    const bucket = markersByStep.get(step);
    if (bucket) bucket.push(marker);
    else markersByStep.set(step, [marker]);
  });
  const kept: number[] = [];
  let lastKeptAttributes: Attributes | null = null;
  for (const segment of resolved.segments) {
    if (!segment.remap) continue;
    if (lastKeptAttributes && attributesEqual(segment.attributes, lastKeptAttributes)) continue;
    kept.push(...(markersByStep.get(segment.startIndex) ?? []));
    lastKeptAttributes = segment.attributes;
  }
  return kept;
}

export function applyRemapSegments(
  plan: SkillPlanEditable,
  segments: readonly RemapSegment[],
  skills: ReadonlyMap<number, EngineSkill>,
  trainedSkills: ReadonlyMap<number, TrainedSkill>
): SkillPlanPatch {
  return {
    markers: segmentsToMarkers(plan.entries, segments, skills, trainedSkills),
    markerAttributes: [],
  };
}

export function applyOptimizerRemapSegments(
  plan: SkillPlanEditable,
  segments: readonly RemapSegment[],
  skills: ReadonlyMap<number, EngineSkill>,
  trainedSkills: ReadonlyMap<number, TrainedSkill>,
  pricing: RemapPricingContext
): SkillPlanPatch {
  const markers = segmentsToMarkers(plan.entries, segments, skills, trainedSkills);
  return {
    markers: dropRedundantMarkers(plan.entries, markers, skills, trainedSkills, pricing),
    markerAttributes: [],
  };
}

export function applyOptimizeForMe(
  plan: SkillPlanEditable,
  order: readonly PlanStep[],
  segments: readonly RemapSegment[],
  skills: ReadonlyMap<number, EngineSkill>,
  trainedSkills: ReadonlyMap<number, TrainedSkill>,
  pricing: RemapPricingContext
): SkillPlanPatch {
  const entries = applyReorderSuggestion(plan.entries, order);
  return {
    ...applyOptimizerRemapSegments({ ...plan, entries }, segments, skills, trainedSkills, pricing),
    entries,
  };
}

export function splitByLevel(
  plan: SkillPlanEditable,
  skills: ReadonlyMap<number, EngineSkill>,
  trainedSkills: ReadonlyMap<number, TrainedSkill>
): SkillPlanPatch | null {
  const split = splitEntriesByLevel(plan.entries, plan.markers, skills, trainedSkills);
  if (!split.changed) return null;
  return { entries: split.entries, ...(split.markers ? { markers: split.markers } : {}) };
}

export function removeEntry(
  plan: SkillPlanEditable,
  skillTypeID: number,
  targetLevel: number
): SkillPlanPatch {
  const entries = withoutEntry(plan.entries, skillTypeID, targetLevel);
  if (!plan.markers) return { entries };
  const entryIndex = plan.entries.findIndex(
    (e) => e.skillTypeID === skillTypeID && e.targetLevel === targetLevel
  );
  if (entryIndex < 0) {
    return {
      entries,
      markers: normalizeMarkers(plan.markers, plan.entries.length),
      markerAttributes: alignedMarkerAttributes(plan),
    };
  }
  const shifted = plan.markers.map((m) => (m > entryIndex ? m - 1 : m));
  return {
    entries,
    markers: normalizeMarkers(shifted, plan.entries.length - 1),
    markerAttributes: normalizeMarkerAttributes(
      shifted,
      plan.markerAttributes,
      plan.entries.length - 1
    ),
  };
}

export function removeTrainedEntries(
  plan: SkillPlanEditable,
  trainedSkills: ReadonlyMap<number, TrainedSkill>
): { patch: SkillPlanPatch; removed: number; undo: Required<SkillPlanEditable> } | null {
  const isTrained = (e: PlanEntry) =>
    (trainedSkills.get(e.skillTypeID)?.level ?? 0) >= e.targetLevel;
  const entries = plan.entries.filter((e) => !isTrained(e));
  const removed = plan.entries.length - entries.length;
  if (removed === 0) return null;
  const undo = {
    entries: plan.entries,
    markers: plan.markers ?? [],
    markerAttributes: plan.markerAttributes ?? [],
  };
  if (!plan.markers) return { patch: { entries }, removed, undo };
  const survivorsBefore = (position: number) =>
    plan.entries.slice(0, position).filter((e) => !isTrained(e)).length;
  const shifted = plan.markers.map(survivorsBefore);
  return {
    patch: {
      entries,
      markers: normalizeMarkers(shifted, entries.length),
      markerAttributes: normalizeMarkerAttributes(shifted, plan.markerAttributes, entries.length),
    },
    removed,
    undo,
  };
}
