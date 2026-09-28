/**
 * Every Skill Plan edit, each a pure `(plan, ...args) => patch`: the Plan
 * Editor (issue #2044) only dispatches — the same shape as the Fitting
 * editor's `engine/fittings/fittingEdit.ts` — and the writes from outside it
 * (`useTargetPlan`'s Add/Undo, `SkillRowContextMenu`'s Add) come through here
 * too. Never mutates its input.
 *
 * A Skill Plan holds three index-aligned lists: `entries`, `markers` (Remap
 * Marker positions into `entries`) and `markerAttributes` (each marker's
 * manual override, by marker ordinal — see `normalizeMarkerAttributes`).
 * Keeping those three consistent is this module's job for every edit: each
 * operation returns a patch in which whatever it touches still lines up, so
 * no caller has to remember which marker helper pairs with which.
 *
 * A patch carries only the fields the edit changes — every caller persists
 * and syncs `{ ...plan, ...patch }`, so an extra field here would be an
 * extra synced write.
 */
import type { SkillPlanRecord } from '@/db';
import { normalizePlan } from '@/engine/plan';
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

/** The three index-aligned lists every operation here keeps consistent. */
export type SkillPlanEditable = Pick<SkillPlanRecord, 'entries' | 'markers' | 'markerAttributes'>;

/** What an operation writes: only the fields it changed. */
export type SkillPlanPatch = Partial<SkillPlanEditable>;

/**
 * Each marker's manual override, aligned to the markers as they read now —
 * `plan.markerAttributes` itself can be stale relative to `plan.markers`, so
 * this is the only way to read it by marker ordinal.
 */
export function alignedMarkerAttributes(plan: SkillPlanEditable): (Attributes | null)[] {
  return normalizeMarkerAttributes(plan.markers, plan.markerAttributes, plan.entries.length);
}

/** Add one entry row at the end, unless the plan already covers that level. */
export function addEntry(plan: SkillPlanEditable, entry: PlanEntry): SkillPlanPatch {
  return { entries: upsertEntry(plan.entries, entry) };
}

/** Set a skill's priority band on every row of that skill. */
export function setPriority(
  plan: SkillPlanEditable,
  skillTypeID: number,
  priority: PlanPriority
): SkillPlanPatch {
  return { entries: setEntryPriority(plan.entries, skillTypeID, priority) };
}

/** Clipboard import, and queue import's Append: merge `imported` onto the entries. */
export function appendImport(
  plan: SkillPlanEditable,
  imported: readonly PlanEntry[]
): SkillPlanPatch {
  return { entries: appendImportedEntries(plan.entries, imported) };
}

/** Accept on "Suggest reorder" / "Shortest first": entries follow the suggested step order. */
export function applyReorder(
  plan: SkillPlanEditable,
  suggestedSteps: readonly PlanStep[]
): SkillPlanPatch {
  return { entries: applyReorderSuggestion(plan.entries, suggestedSteps) };
}

/** "Add remap marker": a new marker after the last entry (the user drags it up), with no override. */
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

/** Remove the marker at ordinal `markerIndex` (normalized order), and its override with it. */
export function removeRemapMarker(plan: SkillPlanEditable, markerIndex: number): SkillPlanPatch {
  const markers = normalizeMarkers(plan.markers, plan.entries.length);
  const markerAttributes = alignedMarkerAttributes(plan);
  markers.splice(markerIndex, 1);
  markerAttributes.splice(markerIndex, 1);
  return { markers, markerAttributes };
}

/** The Remap Marker modal's Save / Clear: set (or clear, via `null`) one marker's override. */
export function setRemapMarkerAttributes(
  plan: SkillPlanEditable,
  markerIndex: number,
  attributes: Attributes | null
): SkillPlanPatch {
  const markerAttributes = alignedMarkerAttributes(plan);
  markerAttributes[markerIndex] = attributes;
  return { markerAttributes };
}

/**
 * A drop's new entries and markers, with each marker's override carried to
 * wherever that marker went — `markerOrder` names, per new marker, which old
 * ordinal it was (see `RowsToState`).
 */
function dropPatch(plan: SkillPlanEditable, state: PlanDropState): SkillPlanPatch {
  const before = alignedMarkerAttributes(plan);
  return {
    entries: state.entries,
    markers: state.markers,
    markerAttributes: state.markerOrder.map((oldOrdinal) => before[oldOrdinal] ?? null),
  };
}

/** Why a drop was refused — `planDrop`'s refusal, for the editor to put into words. */
export type MoveRowRefusal = Extract<PlanDropResult, { ok: false }>;

export type MoveRowResult =
  | {
      ok: true;
      patch: SkillPlanPatch;
      /** Set when the drag started on a prereq row, so the caller can say what it did. */
      promoted: { skillTypeID: number; level: number } | null;
    }
  | MoveRowRefusal;

/**
 * One drag (or keyboard move) on the merged entry/marker/prereq row list:
 * a plain reorder, a prereq row promoted into a real entry, or a refusal of
 * an order the normalizer would silently undo. See `planDrop`.
 */
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

/** The "+" on a prereq row: promote it in place. Null if `rowId` is not a prereq row of `rows`. */
export function promotePrereqRow(
  plan: SkillPlanEditable,
  rows: readonly MergedRow[],
  rowId: string
): SkillPlanPatch | null {
  const result = promotePrereq({ entries: plan.entries, markers: plan.markers, rows, rowId });
  return result ? dropPatch(plan, result) : null;
}

/**
 * Queue import's Replace: the imported entries in, every Remap Marker and
 * override out. `undo` is the patch that puts the plan back exactly as it
 * was — absent marker lists snapshot as empty ones, since a synced write
 * can't carry an explicit `undefined` (Firestore rejects it) and an absent
 * list already reads as empty everywhere.
 */
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

/** Whatever the optimizer needs to re-price a segment, once its markers land. */
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

/**
 * `segmentsToMarkers` snaps a boundary that falls mid-entry (a prereq chain
 * spanning two attribute pairs) forward to the entry after it — correct,
 * since a remap can't happen mid-skill, but it can shift a step or two out of
 * the segment `placeRemaps` costed onto its neighbor. Re-pricing each
 * resulting segment at its ACTUAL (snapped) boundary can then land it on the
 * exact same attribute spread as the segment before it: a remap that changed
 * nothing. Dropping that marker is only safe for markers the OPTIMIZER just
 * proposed (Optimize Remaps / Optimize for me) — never for the user's own
 * Remap Markers (Optimize at my markers), which this must not silently
 * delete. Filters out catalog-missing entries first, the same way
 * `segmentsToMarkers`/`markerStepIndices` do, since `normalizePlan` throws on
 * an unknown skill typeID.
 */
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
  const remapSegments = resolved.segments.filter((s) => s.remap);
  const kept: number[] = [];
  let lastKeptAttributes: Attributes | null = null;
  remapSegments.forEach((segment, i) => {
    if (lastKeptAttributes && attributesEqual(segment.attributes, lastKeptAttributes)) return;
    kept.push(markers[i]);
    lastKeptAttributes = segment.attributes;
  });
  return kept;
}

/**
 * Accept on "Use my remap markers" (Optimize at my markers): the markers
 * become one per remapped segment, replacing the old ones wholesale. Their
 * overrides go too — they were for a segmentation this just discarded. These
 * are the user's own marker positions (just re-costed), so nothing here is
 * ever dropped as redundant — see `applyOptimizerRemapSegments` for that.
 */
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

/**
 * Accept on "Optimize Remaps": same as `applyRemapSegments`, but `segments`
 * is the optimizer's OWN proposal (placeRemaps' search), not the user's
 * existing markers — so a marker whose entry-snapped boundary re-prices to
 * the same spread as the one before it is redundant and gets dropped
 * (`dropRedundantMarkers`). `pricing` is what that re-pricing needs.
 */
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

/**
 * Accept on "Optimize for me": the reordered entries and the markers for
 * them in one write. `segments` index the *new* order, so the markers are
 * placed against it, not against the plan's current entries. Goes through
 * `applyOptimizerRemapSegments`, not `applyRemapSegments`: these are the
 * optimizer's own segments too.
 */
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

/**
 * One row per skill level: split any entry spanning several levels, moving
 * the markers to stay in front of the same entries (their ordinals don't
 * change, so the overrides stay aligned untouched). Null when nothing needs
 * splitting, so the caller can skip a pointless write.
 */
export function splitByLevel(
  plan: SkillPlanEditable,
  skills: ReadonlyMap<number, EngineSkill>,
  trainedSkills: ReadonlyMap<number, TrainedSkill>
): SkillPlanPatch | null {
  const split = splitEntriesByLevel(plan.entries, plan.markers, skills, trainedSkills);
  if (!split.changed) return null;
  return { entries: split.entries, ...(split.markers ? { markers: split.markers } : {}) };
}

/**
 * Remove one entry row. Remap Markers stay anchored to the entries they sat
 * in front of — those after the removed entry shift one position left, and
 * their attributes shift with them. Removing an entry can land two markers
 * on the same position; they collapse into one and the earlier one's
 * attributes survive, the same "first wins" `normalizeMarkerAttributes` uses.
 */
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
