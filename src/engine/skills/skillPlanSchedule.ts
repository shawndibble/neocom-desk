import { alphaCappedStepIndices } from '@/engine/alphaCap';
import { boostedStepIndices } from '@/engine/boosterImpact';
import { optimizeAtMarkers, type PlaceRemapsResult } from '@/engine/optimizer';
import { normalizePlanWithBoundaries } from '@/engine/skills/plan';
import { effectivePriority } from '@/engine/skills/planPriority';
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

export type StepKey = `${number}:${number}`;

export function stepKey(step: PlanStep): StepKey {
  return `${step.skillTypeID}:${step.level}`;
}

export interface SkillPlanScheduleInput {
  entries: readonly PlanEntry[];
  skills: ReadonlyMap<number, EngineSkill>;
  trainedSkills: ReadonlyMap<number, TrainedSkill>;
  attributes: Attributes;
  implants: Implants;
  boosters: readonly Booster[];
  markers: readonly number[] | undefined;
  markerAttributes: readonly (Attributes | null)[];
  cloneState: CloneState;
  startDate: Date;
}

export interface SkillPlanSchedule {
  scheduled: ScheduledStep[];
  stepKeys: StepKey[];
  stepByKey: ReadonlyMap<StepKey, ScheduledStep>;
  entryBoundaries: number[];
  isKnownSkill: (skillTypeID: number) => boolean;
  error: string | null;
  startDate: Date;
  markerStepIndices: number[];
  markersResult: PlaceRemapsResult | null;
  totalSeconds: number;
  finish: Date | null;
  skillCount: number;
  boostedSteps: ReadonlySet<number>;
  alphaCappedSteps: ReadonlySet<number>;
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
