import { remainingSpForLevel, spBetween, trainingRate } from '@/engine/sp';
import type {
  AttributeName,
  Attributes,
  Booster,
  CloneState,
  EngineSkill,
  Implants,
  PlanStep,
  ScheduledStep,
  TrainedSkill,
} from '@/engine/types';

/** A Remap Marker's segment: `attributes` apply from `steps[startIndex]` onward. */
export interface AttributeSegment {
  startIndex: number;
  attributes: Attributes;
}

export interface ScheduleOptions {
  /** Base + remap attribute values; also covers any steps before the earliest `segments` entry. */
  attributes: Attributes;
  /**
   * Per-segment attribute overrides for Remap Markers, keyed by step index
   * ("apply `attributes` from `steps[startIndex]` onward"). Need not be
   * sorted or start at 0 — steps before the earliest segment use `attributes`
   * above. Omit (the default) for the plan's original flat-attributes
   * behaviour.
   */
  segments?: readonly AttributeSegment[];
  implants?: Implants;
  /** Active cerebral accelerators; bonuses apply until their expiry. */
  boosters?: Booster[];
  /** Wall-clock start of training; required when boosters are present. */
  startDate?: Date;
  /**
   * The character's trained skills, read for their `sp` so a level already
   * part-trained is charged only for what is left of it (`remainingSpForLevel`).
   * Omit — the default — and every step costs its whole level, which is the
   * behaviour this function has always had.
   *
   * **Two schedules being compared must pass this to both or to neither.**
   * `placeRemaps` takes its no-remap baseline from here but costs its remap
   * branches from `(rank, level)` alone; crediting one side and not the other
   * makes the baseline artificially cheap and shrinks the reported savings
   * toward a false "no remap improves this plan". A uniform overstatement on
   * both sides cancels out of a difference, so the optimizer deliberately
   * does not pass it.
   */
  trainedSkills?: ReadonlyMap<number, TrainedSkill>;
  /** Omit for Omega. Alpha halves the rate, so a Booster covers half the SP. */
  cloneState?: CloneState;
}

const EPSILON_SP = 1e-9;

/**
 * Compute per-step training time. Rates are piecewise-constant: when a booster
 * starts or expires mid-step, the step is split at that instant and trains
 * the remainder at the changed rate.
 */
export function computeSchedule(
  steps: readonly PlanStep[],
  options: ScheduleOptions,
  skills: ReadonlyMap<number, EngineSkill>
): ScheduledStep[] {
  const {
    attributes,
    segments = [],
    implants = {},
    boosters = [],
    startDate,
    trainedSkills,
    cloneState,
  } = options;
  if (boosters.length > 0 && !startDate) {
    throw new Error('startDate is required when boosters are provided');
  }
  const startMs = startDate?.getTime() ?? 0;

  // Each booster's live window, in seconds from start. Absent startsAt means
  // already running (live from before the schedule begins).
  const boosterWindows = boosters.map((b) => ({
    bonus: b.bonus,
    startOffset: b.startsAt ? (b.startsAt.getTime() - startMs) / 1000 : -Infinity,
    expiryOffset: (b.expiresAt.getTime() - startMs) / 1000,
  }));

  // Rate breakpoints: every start and expiry offset that still lies ahead.
  const breakpoints = [
    ...boosterWindows.map((w) => w.startOffset),
    ...boosterWindows.map((w) => w.expiryOffset),
  ]
    .filter((offset) => offset > 0)
    .sort((a, b) => a - b);

  const sortedSegments = [...segments].sort((a, b) => a.startIndex - b.startIndex);

  const baseAttributesForStep = (stepIndex: number): Attributes => {
    let result = attributes;
    for (const segment of sortedSegments) {
      if (segment.startIndex <= stepIndex) result = segment.attributes;
      else break;
    }
    return result;
  };

  const attributeAt = (
    baseAttributes: Attributes,
    name: AttributeName,
    elapsedSeconds: number
  ): number => {
    let value = baseAttributes[name] + (implants[name] ?? 0);
    for (const { bonus, startOffset, expiryOffset } of boosterWindows) {
      if (elapsedSeconds >= startOffset && elapsedSeconds < expiryOffset) {
        value += bonus[name] ?? 0;
      }
    }
    return value;
  };

  const nextBreakpointAfter = (elapsedSeconds: number): number => {
    for (const offset of breakpoints) {
      if (offset > elapsedSeconds) return offset;
    }
    return Infinity;
  };

  const result: ScheduledStep[] = [];
  let elapsed = 0;

  for (const [stepIndex, step] of steps.entries()) {
    const skill = skills.get(step.skillTypeID);
    if (!skill) throw new Error(`Unknown skill typeID ${step.skillTypeID}`);
    const baseAttributes = baseAttributesForStep(stepIndex);

    // Only the level actually in progress can carry banked SP:
    // `remainingSpForLevel` clamps `currentSp` into this level's own band, so
    // a later level of the same skill still costs the full amount.
    const currentSp = trainedSkills?.get(step.skillTypeID)?.sp;
    const sp =
      currentSp === undefined
        ? spBetween(skill.rank, step.level - 1, step.level)
        : remainingSpForLevel(skill.rank, step.level, currentSp);
    let remaining = sp;
    let seconds = 0;

    while (remaining > EPSILON_SP) {
      const now = elapsed + seconds;
      const rate = trainingRate(
        attributeAt(baseAttributes, skill.primary, now),
        attributeAt(baseAttributes, skill.secondary, now),
        cloneState
      );
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
