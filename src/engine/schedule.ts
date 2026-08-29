import { spBetween, trainingRate } from '@/engine/sp';
import type {
  AttributeName,
  Attributes,
  Booster,
  EngineSkill,
  Implants,
  PlanStep,
  ScheduledStep,
} from '@/engine/types';

export interface ScheduleOptions {
  /** Base + remap attribute values. */
  attributes: Attributes;
  implants?: Implants;
  /** Active cerebral accelerators; bonuses apply until their expiry. */
  boosters?: Booster[];
  /** Wall-clock start of training; required when boosters are present. */
  startDate?: Date;
}

const EPSILON_SP = 1e-9;

/**
 * Compute per-step training time. Rates are piecewise-constant: when a booster
 * expires mid-step, the step is split and the remainder trains at the reduced rate.
 */
export function computeSchedule(
  steps: readonly PlanStep[],
  options: ScheduleOptions,
  skills: ReadonlyMap<number, EngineSkill>,
): ScheduledStep[] {
  const { attributes, implants = {}, boosters = [], startDate } = options;
  if (boosters.length > 0 && !startDate) {
    throw new Error('startDate is required when boosters are provided');
  }
  const startMs = startDate?.getTime() ?? 0;

  // Booster expiry offsets in seconds from start (rate breakpoints).
  const expiryOffsets = boosters
    .map((b) => (b.expiresAt.getTime() - startMs) / 1000)
    .filter((offset) => offset > 0)
    .sort((a, b) => a - b);

  const attributeAt = (name: AttributeName, elapsedSeconds: number): number => {
    let value = attributes[name] + (implants[name] ?? 0);
    for (const booster of boosters) {
      const offset = (booster.expiresAt.getTime() - startMs) / 1000;
      if (elapsedSeconds < offset) value += booster.bonus[name] ?? 0;
    }
    return value;
  };

  const nextBreakpointAfter = (elapsedSeconds: number): number => {
    for (const offset of expiryOffsets) {
      if (offset > elapsedSeconds) return offset;
    }
    return Infinity;
  };

  const result: ScheduledStep[] = [];
  let elapsed = 0;

  for (const step of steps) {
    const skill = skills.get(step.skillTypeID);
    if (!skill) throw new Error(`Unknown skill typeID ${step.skillTypeID}`);

    const sp = spBetween(skill.rank, step.level - 1, step.level);
    let remaining = sp;
    let seconds = 0;

    while (remaining > EPSILON_SP) {
      const now = elapsed + seconds;
      const rate = trainingRate(attributeAt(skill.primary, now), attributeAt(skill.secondary, now));
      const spPerSecond = rate / 60;
      const segmentEnd = nextBreakpointAfter(now);
      const secondsNeeded = remaining / spPerSecond;

      if (now + secondsNeeded <= segmentEnd) {
        seconds += secondsNeeded;
        remaining = 0;
      } else {
        const segmentSeconds = segmentEnd - now;
        remaining -= spPerSecond * segmentSeconds;
        seconds += segmentSeconds;
      }
    }

    elapsed += seconds;
    result.push({ ...step, sp, seconds, cumulativeSeconds: elapsed });
  }

  return result;
}
