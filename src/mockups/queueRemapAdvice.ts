import { placeRemaps, type PlaceRemapsResult } from '@/engine/optimizer';
import type { EngineSkill } from '@/engine/types';
import { MIN_MEANINGFUL_SAVINGS_SECONDS } from '@/features/skills/planner/planHeaderStats';
import { SCENARIOS, queueEntries, type ScenarioName } from './queueRemapFixtures';

/** Seconds until the level training now finishes: the plan editor's "Trains first in game". */
function headSeconds(name: ScenarioName, nowMs: number): number {
  const scenario = SCENARIOS[name];
  const head = queueEntries(scenario.queue, scenario.attributes, nowMs)[0];
  return head?.finish_date ? (new Date(head.finish_date).getTime() - nowMs) / 1000 : 0;
}

/**
 * What Optimize queue runs: the planner's own `placeRemaps` on the queue
 * after the level training now (the editor leaves that one out too, so the
 * new plan's Remap savings is this figure), with the live remap budget, the
 * yearly remap held to its cooldown date.
 */
export function queueAdvice(
  name: ScenarioName,
  skills: ReadonlyMap<number, EngineSkill>,
  nowMs: number
): PlaceRemapsResult {
  const scenario = SCENARIOS[name];
  const steps = scenario.queue
    .slice(1)
    .map((s) => ({ skillTypeID: s.skillTypeID, level: s.level }));
  const notBefore = scenario.yearlyInDays * 86_400 - headSeconds(name, nowMs);
  return placeRemaps(steps, skills, {
    remapCount: Math.min(2, scenario.bonusRemaps + 1),
    currentAttributes: scenario.attributes,
    ...(scenario.yearlyInDays <= 0
      ? {}
      : { timedRemap: { notBeforeSeconds: Math.max(0, notBefore) } }),
  });
}

export function savesTime(result: PlaceRemapsResult): boolean {
  return result.savingsSeconds >= MIN_MEANINGFUL_SAVINGS_SECONDS;
}

/** The advice as the new plan's Remap Markers (plan entries include the level training now). */
export function adviceMarkers(result: PlaceRemapsResult) {
  const remapped = result.segments.filter((segment) => segment.remap);
  return {
    markers: remapped.map((segment) => segment.startIndex + 1),
    markerAttributes: remapped.map((segment) => segment.attributes),
  };
}
