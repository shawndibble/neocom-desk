/**
 * "Optimize at remap points" (CONTEXT.md): the user places Remap Markers in
 * the plan; this computes the best attribute spread for each marker-delimited
 * segment. Unlike placeRemaps, the boundaries are user-chosen, not searched:
 * segment 0 (before the first marker) trains on the CURRENT attributes at no
 * remap cost, and every marker starts a segment trained on its own
 * bestAttributes spread.
 *
 * Markers are step indices ("remap before step i"). Out-of-range markers are
 * clamped to [0, steps.length]; duplicates and the empty segments they leave
 * (e.g. a marker at steps.length) are dropped.
 */
import {
  aggregateSpByPair,
  bestAttributesForPairs,
  type BoosterContext,
} from '@/engine/optimizer/bestAttributes';
import type { PlaceRemapsResult, RemapSegment } from '@/engine/optimizer/placeRemaps';
import { computeSchedule } from '@/engine/schedule';
import { spBetween, timeToTrain, trainingRate } from '@/engine/sp';
import type { Attributes, CloneState, EngineSkill, Implants, PlanStep } from '@/engine/types';

export interface OptimizeAtMarkersOptions {
  /** Step indices where the user will remap ("remap before step i"). */
  markers: readonly number[];
  currentAttributes: Attributes;
  implants?: Implants;
  /**
   * Live Boosters and when the plan starts training. Omit for Booster-blind
   * costing — matches `placeRemaps`' own `booster` option.
   */
  booster?: BoosterContext;
  /**
   * Manual attribute override per marker, aligned index-for-index to
   * `markers` (not to the deduped/sorted cut points) — the same convention
   * `normalizeMarkerAttributes` uses. `null`/absent falls back to the
   * optimizer's own best spread for that marker's segment. When two markers
   * collapse onto the same cut, the first one's override wins.
   */
  manualAttributes?: readonly (Attributes | null)[];
  /**
   * Omit for Omega. Only the costing changes: halving every rate leaves the
   * best spread for a segment the same, so the allocation search ignores it.
   */
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

  // Cost `steps[start, end)` on fixed `attrs`, Booster-aware (against
  // `liveBoosters`, offset by how far into the plan this segment starts)
  // when a booster context was given, blind otherwise.
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

  // Baseline: whole plan on current attributes (Booster-aware). Computed
  // before `elapsedSeconds` starts accumulating, so it always starts at 0.
  const currentSeconds = segmentSeconds(0, steps.length, currentAttributes);

  const cuts = [...new Set(markers.map((m) => Math.min(steps.length, Math.max(0, m))))].sort(
    (a, b) => a - b
  );

  // First manual override at each cut's step index, in the caller's marker
  // order — mirrors `normalizeMarkerAttributes`'s "first write wins".
  const manualByStep = new Map<number, Attributes | null>();
  markers.forEach((m, i) => {
    const clamped = Math.min(steps.length, Math.max(0, m));
    if (!manualByStep.has(clamped)) manualByStep.set(clamped, manualAttributes?.[i] ?? null);
  });

  const segments: RemapSegment[] = [];

  // Leading current-attributes segment: everything before the first marker.
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

  // One remapped segment per marker: a manual override when set, otherwise
  // its own best spread.
  cuts.forEach((start, i) => {
    const end = cuts[i + 1] ?? steps.length; // exclusive
    if (start >= end) return; // empty (marker at/beyond the plan end)
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
