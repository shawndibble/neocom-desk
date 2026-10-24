import { computeSkillPlanSchedule } from '@/engine/skills/skillPlanSchedule';
import type {
  Attributes,
  Booster,
  CloneState,
  EngineSkill,
  Implants,
  PlanEntry,
  TrainedSkill,
} from '@/engine/types';

/** Why a Character could not be timed against a plan. */
export type PlanTimingUnavailableReason =
  | 'skills-permission'
  | 'skills-failed'
  | 'attributes-unavailable'
  | 'implants-unavailable'
  | 'plan-invalid';

/** What one Character brings to the timing, or why there is nothing to time. */
export type CharacterTimingInput =
  | { kind: 'unavailable'; reason: PlanTimingUnavailableReason }
  | {
      kind: 'ready';
      /** Queue-corrected trained skills. */
      trained: ReadonlyMap<number, TrainedSkill>;
      /** Base attributes (implants removed). */
      attributes: Attributes;
      implants: Implants;
      boosters: readonly Booster[];
      cloneState: CloneState;
    };

export type PlanTimingResult =
  | { kind: 'training'; seconds: number; remainingSp: number }
  | { kind: 'complete' }
  | { kind: 'unavailable'; reason: PlanTimingUnavailableReason };

/**
 * How long one Character needs to finish a plan, from now, on their own
 * attributes and implants. No Remap Markers, no What-If lens and no live
 * queue: the same plan costed identically for everyone, so rows compare.
 * A Character who cannot be read is `unavailable`, never "nothing missing".
 */
export function planTimeToFinish(
  entries: readonly PlanEntry[],
  skills: ReadonlyMap<number, EngineSkill>,
  character: CharacterTimingInput,
  startDate: Date
): PlanTimingResult {
  if (character.kind === 'unavailable') return character;
  const schedule = computeSkillPlanSchedule({
    entries,
    skills,
    trainedSkills: character.trained,
    attributes: character.attributes,
    implants: character.implants,
    boosters: character.boosters,
    markers: undefined,
    markerAttributes: [],
    cloneState: character.cloneState,
    startDate,
  });
  if (schedule.error) return { kind: 'unavailable', reason: 'plan-invalid' };
  if (schedule.scheduled.length === 0) return { kind: 'complete' };
  return {
    kind: 'training',
    seconds: schedule.totalSeconds,
    remainingSp: schedule.scheduled.reduce((sum, step) => sum + step.sp, 0),
  };
}

export interface ClosestRow {
  characterId: number;
  seconds: number;
  remainingSp: number;
}

export interface ClosestRanking {
  /** Still training, nearest first (ties by Character id, for a stable order). */
  rows: ClosestRow[];
  complete: number[];
  unavailable: { characterId: number; reason: PlanTimingUnavailableReason }[];
}

/** Sort per-Character results into ranked rows plus the two collapsed groups. */
export function rankClosest(results: ReadonlyMap<number, PlanTimingResult>): ClosestRanking {
  const ranking: ClosestRanking = { rows: [], complete: [], unavailable: [] };
  for (const [characterId, result] of results) {
    if (result.kind === 'training') {
      ranking.rows.push({ characterId, seconds: result.seconds, remainingSp: result.remainingSp });
    } else if (result.kind === 'complete') {
      ranking.complete.push(characterId);
    } else {
      ranking.unavailable.push({ characterId, reason: result.reason });
    }
  }
  ranking.rows.sort((a, b) => a.seconds - b.seconds || a.characterId - b.characterId);
  return ranking;
}
