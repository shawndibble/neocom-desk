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
import { aggregateSpByPair, bestAttributesForPairs } from '@/engine/optimizer/bestAttributes';
import type { PlaceRemapsResult, RemapSegment } from '@/engine/optimizer/placeRemaps';
import { spBetween, timeToTrain, trainingRate } from '@/engine/sp';
import type { Attributes, EngineSkill, Implants, PlanStep } from '@/engine/types';

export interface OptimizeAtMarkersOptions {
  /** Step indices where the user will remap ("remap before step i"). */
  markers: readonly number[];
  currentAttributes: Attributes;
  implants?: Implants;
}

export function optimizeAtMarkers(
  steps: readonly PlanStep[],
  skills: ReadonlyMap<number, EngineSkill>,
  options: OptimizeAtMarkersOptions
): PlaceRemapsResult {
  const { markers, currentAttributes, implants = {} } = options;

  if (steps.length === 0) {
    return { segments: [], totalSeconds: 0, currentSeconds: 0, savingsSeconds: 0 };
  }

  // Per-step seconds on the current attributes (the no-remap baseline).
  const stepSeconds = steps.map((step) => {
    const skill = skills.get(step.skillTypeID);
    if (!skill) throw new Error(`Unknown skill typeID ${step.skillTypeID}`);
    const sp = spBetween(skill.rank, step.level - 1, step.level);
    const rate = trainingRate(
      currentAttributes[skill.primary] + (implants[skill.primary] ?? 0),
      currentAttributes[skill.secondary] + (implants[skill.secondary] ?? 0)
    );
    return timeToTrain(sp, rate);
  });
  const currentSeconds = stepSeconds.reduce((acc, s) => acc + s, 0);

  const cuts = [...new Set(markers.map((m) => Math.min(steps.length, Math.max(0, m))))].sort(
    (a, b) => a - b
  );

  const segments: RemapSegment[] = [];

  // Leading current-attributes segment: everything before the first marker.
  const firstCut = cuts[0] ?? steps.length;
  if (firstCut > 0) {
    segments.push({
      startIndex: 0,
      endIndex: firstCut - 1,
      attributes: { ...currentAttributes },
      seconds: stepSeconds.slice(0, firstCut).reduce((acc, s) => acc + s, 0),
      remap: false,
    });
  }

  // One remapped segment per marker, each with its own best spread.
  cuts.forEach((start, i) => {
    const end = cuts[i + 1] ?? steps.length; // exclusive
    if (start >= end) return; // empty (marker at/beyond the plan end)
    const best = bestAttributesForPairs(
      aggregateSpByPair(steps.slice(start, end), skills),
      implants
    );
    segments.push({
      startIndex: start,
      endIndex: end - 1,
      attributes: best.attributes,
      seconds: best.seconds,
      remap: true,
    });
  });

  const totalSeconds = segments.reduce((acc, s) => acc + s.seconds, 0);
  return {
    segments,
    totalSeconds,
    currentSeconds,
    savingsSeconds: currentSeconds - totalSeconds,
  };
}
