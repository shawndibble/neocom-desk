import { remainingSpForLevel, spBetween, trainingRate } from '@/engine/skills/sp';
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

export interface AttributeSegment {
  startIndex: number;
  attributes: Attributes;
}

export interface ScheduleOptions {
  attributes: Attributes;
  segments?: readonly AttributeSegment[];
  implants?: Implants;
  boosters?: Booster[];
  startDate?: Date;
  trainedSkills?: ReadonlyMap<number, TrainedSkill>;
  cloneState?: CloneState;
}

const EPSILON_SP = 1e-9;

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

  const boosterWindows = boosters.map((b) => ({
    bonus: b.bonus,
    startOffset: b.startsAt ? (b.startsAt.getTime() - startMs) / 1000 : -Infinity,
    expiryOffset: (b.expiresAt.getTime() - startMs) / 1000,
  }));

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
