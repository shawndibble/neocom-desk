import {
  aggregateSpByPair,
  bestAttributesForPairs,
  type BoosterContext,
} from '@/engine/optimizer/bestAttributes';
import type { PlaceRemapsResult, RemapSegment } from '@/engine/optimizer/placeRemaps';
import { computeSchedule } from '@/engine/schedule';
import { spBetween, timeToTrain, trainingRate } from '@/engine/skills/sp';
import type { Attributes, CloneState, EngineSkill, Implants, PlanStep } from '@/engine/types';

export interface OptimizeAtMarkersOptions {
  markers: readonly number[];
  currentAttributes: Attributes;
  implants?: Implants;
  booster?: BoosterContext;
  manualAttributes?: readonly (Attributes | null)[];
  cloneState?: CloneState;
}

export function optimizeAtMarkers(
  steps: readonly PlanStep[],
  skills: ReadonlyMap<number, EngineSkill>,
  options: OptimizeAtMarkersOptions
): PlaceRemapsResult {
  const {
    markers,
    currentAttributes,
    implants = {},
    booster,
    manualAttributes,
    cloneState,
  } = options;

  if (steps.length === 0) {
    return { segments: [], totalSeconds: 0, currentSeconds: 0, savingsSeconds: 0 };
  }

  const liveBoosters =
    booster?.boosters.filter((b) => b.expiresAt.getTime() > booster.startDate.getTime()) ?? [];
  const boosted = booster !== undefined && liveBoosters.length > 0;

  let elapsedSeconds = 0;

  const segmentSeconds = (start: number, end: number, attrs: Attributes): number => {
    if (boosted) {
      const startDate = new Date(booster!.startDate.getTime() + elapsedSeconds * 1000);
      return computeSchedule(
        steps.slice(start, end),
        { attributes: attrs, implants, boosters: liveBoosters, startDate, cloneState },
        skills
      ).reduce((acc, s) => acc + s.seconds, 0);
    }
    return steps.slice(start, end).reduce((acc, step) => {
      const skill = skills.get(step.skillTypeID);
      if (!skill) throw new Error(`Unknown skill typeID ${step.skillTypeID}`);
      const sp = spBetween(skill.rank, step.level - 1, step.level);
      const rate = trainingRate(
        attrs[skill.primary] + (implants[skill.primary] ?? 0),
        attrs[skill.secondary] + (implants[skill.secondary] ?? 0),
        cloneState
      );
      return acc + timeToTrain(sp, rate);
    }, 0);
  };

  const currentSeconds = segmentSeconds(0, steps.length, currentAttributes);

  const cuts = [...new Set(markers.map((m) => Math.min(steps.length, Math.max(0, m))))].sort(
    (a, b) => a - b
  );

  const manualByStep = new Map<number, Attributes | null>();
  markers.forEach((m, i) => {
    const clamped = Math.min(steps.length, Math.max(0, m));
    if (!manualByStep.has(clamped)) manualByStep.set(clamped, manualAttributes?.[i] ?? null);
  });

  const segments: RemapSegment[] = [];

  const firstCut = cuts[0] ?? steps.length;
  if (firstCut > 0) {
    const seconds = segmentSeconds(0, firstCut, currentAttributes);
    segments.push({
      startIndex: 0,
      endIndex: firstCut - 1,
      attributes: { ...currentAttributes },
      seconds,
      remap: false,
    });
    elapsedSeconds += seconds;
  }

  cuts.forEach((start, i) => {
    const end = cuts[i + 1] ?? steps.length;
    if (start >= end) return;
    const override = manualByStep.get(start) ?? null;
    const attributes =
      override ??
      bestAttributesForPairs(aggregateSpByPair(steps.slice(start, end), skills), implants)
        .attributes;
    const seconds = segmentSeconds(start, end, attributes);
    segments.push({ startIndex: start, endIndex: end - 1, attributes, seconds, remap: true });
    elapsedSeconds += seconds;
  });

  const totalSeconds = segments.reduce((acc, s) => acc + s.seconds, 0);
  return {
    segments,
    totalSeconds,
    currentSeconds,
    savingsSeconds: currentSeconds - totalSeconds,
  };
}
