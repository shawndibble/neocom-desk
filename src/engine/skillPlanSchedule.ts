/**
 * Skill Plan schedule (CONTEXT.md): everything the plan editor shows about
 * *when* a Skill Plan trains, computed in one pass from one set of inputs.
 *
 * The plan editor used to assemble this itself — normalize, place Remap
 * Markers, optimize at them, schedule, then separately derive totals, Booster
 * and Alpha marks and priorities — each with its own copy of the
 * unknown-skill filter. Keeping it here means the plan total, finish date and
 * the marker savings badge are built from the same segments by construction,
 * and each rule is testable without rendering the editor.
 */
import { alphaCappedStepIndices } from '@/engine/alphaCap';
import { boostedStepIndices } from '@/engine/boosterImpact';
import { optimizeAtMarkers, type PlaceRemapsResult } from '@/engine/optimizer';
import { normalizePlanWithBoundaries } from '@/engine/plan';
import { effectivePriority } from '@/engine/planPriority';
import { markerStepIndices } from '@/engine/remapMarkers';
import { computeSchedule, type AttributeSegment } from '@/engine/schedule';
import type {
  Attributes,
  Booster,
  CloneState,
  EngineSkill,
  Implants,
  PlanEntry,
  PlanPriority,
  PlanStep,
  ScheduledStep,
  TrainedSkill,
} from '@/engine/types';

/**
 * A step's identity: skill and level. Unique within a schedule — the
 * normalizer never emits the same level twice — and unchanged by reordering,
 * so a result computed against one schedule can be looked up in a later one
 * and simply miss when the step is gone, where an array index would silently
 * point at some other step.
 */
export type StepKey = `${number}:${number}`;

export function stepKey(step: PlanStep): StepKey {
  return `${step.skillTypeID}:${step.level}`;
}

export interface SkillPlanScheduleInput {
  entries: readonly PlanEntry[];
  skills: ReadonlyMap<number, EngineSkill>;
  /**
   * Read twice, for two different things: the normalizer takes the levels
   * (which steps to emit), the scheduler takes the SP (how much of the first
   * such step is already paid for). Without the second, a plan that opens on
   * the skill the character is currently training re-charges the whole level
   * and reads hours longer than the in-game queue for it.
   */
  trainedSkills: ReadonlyMap<number, TrainedSkill>;
  /** Base attributes (implants removed). */
  attributes: Attributes;
  /** Real or What-If Implants — whichever the plan is costed under. */
  implants: Implants;
  boosters: readonly Booster[];
  /** Remap Marker entry-list positions, as stored on the plan. */
  markers: readonly number[] | undefined;
  /** Manual marker overrides, aligned to the normalized markers (`normalizeMarkerAttributes`). */
  markerAttributes: readonly (Attributes | null)[];
  cloneState: CloneState;
  /** "Now": the one origin for Booster expiry and the finish date, so the two cannot disagree (#20). */
  startDate: Date;
}

export interface SkillPlanSchedule {
  scheduled: ScheduledStep[];
  /** `stepKeys[i]` is `stepKey(scheduled[i])`. */
  stepKeys: StepKey[];
  stepByKey: ReadonlyMap<StepKey, ScheduledStep>;
  /**
   * entryBoundaries[i] = scheduled.length after the i-th entry *known to the
   * catalog* (see normalizePlanWithBoundaries).
   */
  entryBoundaries: number[];
  /** The one unknown-skill test every consumer of this schedule shares. */
  isKnownSkill: (skillTypeID: number) => boolean;
  /** The normalizer's message when it rejects the plan; the schedule is then empty. */
  error: string | null;
  startDate: Date;
  /** Step index each normalized Remap Marker remaps before. */
  markerStepIndices: number[];
  /**
   * "Optimize at my markers" for the plan's current markers (manual overrides
   * and Boosters honoured), `null` without markers. `scheduled` is costed on
   * exactly these segments, so the plan total/finish date and the savings
   * badge cannot disagree about what a segment trains on (#1232).
   */
  markersResult: PlaceRemapsResult | null;
  totalSeconds: number;
  /** No steps, no finish — never one invented for an empty or all-trained plan (#20). */
  finish: Date | null;
  /** Distinct skills in `scheduled`, injected prerequisites included: the set `totalSeconds` times. */
  skillCount: number;
  /** Indices into `scheduled` the Booster speeds up; empty without one. */
  boostedSteps: ReadonlySet<number>;
  /** Indices into `scheduled` an Alpha clone cannot train; empty on Omega. */
  alphaCappedSteps: ReadonlySet<number>;
  /** Effective priority per skill (#27), prerequisites inheriting what needs them. */
  priorityMap: ReadonlyMap<number, PlanPriority>;
}

const EMPTY: ReadonlySet<number> = new Set();

export function computeSkillPlanSchedule(input: SkillPlanScheduleInput): SkillPlanSchedule {
  const {
    entries,
    skills,
    trainedSkills,
    attributes,
    implants,
    boosters,
    markers,
    markerAttributes,
    cloneState,
    startDate,
  } = input;

  // A stale plan, or a skill imported from a newer SDE snapshot than ours.
  const isKnownSkill = (skillTypeID: number): boolean => skills.has(skillTypeID);
  const knownEntries = entries.filter((e) => isKnownSkill(e.skillTypeID));
  const priorityMap = effectivePriority(knownEntries, skills);

  let scheduled: ScheduledStep[] = [];
  let entryBoundaries: number[] = [];
  let markerSteps: number[] = [];
  let markersResult: PlaceRemapsResult | null = null;
  let error: string | null = null;
  try {
    const normalized = normalizePlanWithBoundaries(knownEntries, skills, trainedSkills);
    // Raw entries: marker positions address the stored list, unknowns included.
    const markerIdx = markerStepIndices(entries, markers, skills, trainedSkills);
    const result =
      markerIdx.length > 0
        ? optimizeAtMarkers(normalized.steps, skills, {
            markers: markerIdx,
            currentAttributes: attributes,
            implants,
            booster: boosters.length > 0 ? { boosters: [...boosters], startDate } : undefined,
            manualAttributes: markerAttributes,
            cloneState,
          })
        : null;
    const segments: AttributeSegment[] | undefined = result?.segments.map((s) => ({
      startIndex: s.startIndex,
      attributes: s.attributes,
    }));
    scheduled = computeSchedule(
      normalized.steps,
      {
        attributes,
        implants,
        boosters: [...boosters],
        startDate,
        trainedSkills,
        segments,
        cloneState,
      },
      skills
    );
    entryBoundaries = normalized.entryBoundaries;
    markerSteps = markerIdx;
    markersResult = result;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const stepKeys = scheduled.map(stepKey);
  const totalSeconds = scheduled.length > 0 ? scheduled[scheduled.length - 1].cumulativeSeconds : 0;

  return {
    scheduled,
    stepKeys,
    stepByKey: new Map(stepKeys.map((key, i) => [key, scheduled[i]])),
    entryBoundaries,
    isKnownSkill,
    error,
    startDate,
    markerStepIndices: markerSteps,
    markersResult,
    totalSeconds,
    finish: scheduled.length > 0 ? new Date(startDate.getTime() + totalSeconds * 1000) : null,
    skillCount: new Set(scheduled.map((s) => s.skillTypeID)).size,
    boostedSteps:
      boosters.length > 0 ? boostedStepIndices(scheduled, skills, boosters, startDate) : EMPTY,
    alphaCappedSteps: cloneState === 'alpha' ? alphaCappedStepIndices(scheduled, skills) : EMPTY,
    priorityMap,
  };
}
