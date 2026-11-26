import { sum } from '../math';
import { timeToTrain, trainingRate } from '../skills/sp';
import type { AttributeName, Attributes, CloneState, Implants } from '../types';

export interface QueueEntryInput {
  skillTypeID: number;
  remainingSp: number;
  primary: AttributeName;
  secondary: AttributeName;
}

export interface CloneInput {
  id: string | number;
  implants: Implants;
}

export interface CloneTrainingInput {
  queue: readonly QueueEntryInput[];
  paused?: boolean;
  baseAttributes: Attributes;
  clones: readonly CloneInput[];
  wornCloneId: string | number;
  cloneState?: CloneState;
  now: Date;
  cooldownReadyAt?: Date | null;
}

export interface CloneTrainingFigure {
  finish: Date | null;
  deltaSeconds: number | null;
}

export interface CloneTrainingResult extends CloneTrainingFigure {
  cloneId: string | number;
  totalSeconds: number | null;
  stayThenSwitch?: CloneTrainingFigure;
}

function entryRate(
  entry: QueueEntryInput,
  base: Attributes,
  implants: Implants,
  cloneState: CloneState
): number {
  return trainingRate(
    base[entry.primary] + (implants[entry.primary] ?? 0),
    base[entry.secondary] + (implants[entry.secondary] ?? 0),
    cloneState
  );
}

export function queueEntrySeconds(
  queue: readonly QueueEntryInput[],
  base: Attributes,
  implants: Implants,
  cloneState: CloneState
): number[] {
  return queue.map((e) => timeToTrain(e.remainingSp, entryRate(e, base, implants, cloneState)));
}

function queueSeconds(
  queue: readonly QueueEntryInput[],
  base: Attributes,
  implants: Implants,
  cloneState: CloneState
): number {
  return sum(queueEntrySeconds(queue, base, implants, cloneState));
}

export function stayThenSwitchEntrySeconds(
  queue: readonly QueueEntryInput[],
  base: Attributes,
  stay: Implants,
  target: Implants,
  cloneState: CloneState,
  stayBudget: number
): number[] {
  let budget = stayBudget;
  return queue.map((e) => {
    const stayRate = entryRate(e, base, stay, cloneState);
    const staySeconds = timeToTrain(e.remainingSp, stayRate);
    if (budget >= staySeconds) {
      budget -= staySeconds;
      return staySeconds;
    }
    const doneSp = (budget / 60) * stayRate;
    const seconds =
      budget + timeToTrain(e.remainingSp - doneSp, entryRate(e, base, target, cloneState));
    budget = 0;
    return seconds;
  });
}

export function cloneTrainingTimes(input: CloneTrainingInput): CloneTrainingResult[] {
  const { queue, baseAttributes, clones, wornCloneId, now, cooldownReadyAt, paused } = input;
  const cloneState = input.cloneState ?? 'omega';
  const worn = clones.find((c) => c.id === wornCloneId);
  if (!worn) throw new RangeError('wornCloneId must match one of clones');
  const wornImplants = worn.implants;
  const at = (seconds: number) => new Date(now.getTime() + seconds * 1000);

  if (paused) {
    return clones.map((c) => ({
      cloneId: c.id,
      totalSeconds: null,
      finish: null,
      deltaSeconds: null,
    }));
  }

  const wornSeconds = queueSeconds(queue, baseAttributes, wornImplants, cloneState);
  const cooldownSeconds =
    cooldownReadyAt && cooldownReadyAt.getTime() > now.getTime()
      ? (cooldownReadyAt.getTime() - now.getTime()) / 1000
      : null;

  return clones.map((c) => {
    const total = queueSeconds(queue, baseAttributes, c.implants, cloneState);
    const result: CloneTrainingResult = {
      cloneId: c.id,
      totalSeconds: total,
      finish: at(total),
      deltaSeconds: total - wornSeconds,
    };
    if (cooldownSeconds !== null) {
      const switched = sum(
        stayThenSwitchEntrySeconds(
          queue,
          baseAttributes,
          wornImplants,
          c.implants,
          cloneState,
          cooldownSeconds
        )
      );
      result.stayThenSwitch = { finish: at(switched), deltaSeconds: switched - wornSeconds };
    }
    return result;
  });
}
