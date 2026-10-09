import { timeToTrain, trainingRate } from './sp';
import type { AttributeName, Attributes, CloneState, Implants } from './types';

/**
 * How long does the active training queue take if the Character wore each of
 * their clones instead? Reuses `trainingRate` / `timeToTrain` from `sp.ts` (the
 * same `primary + secondary/2` formula `computeSchedule` uses), evaluating the
 * attribute pair per queue entry. Pure: no clock reads, no I/O.
 */

export interface QueueEntryInput {
  skillTypeID: number;
  /** SP still to train on this entry. */
  remainingSp: number;
  primary: AttributeName;
  secondary: AttributeName;
}

export interface CloneInput {
  id: string | number;
  /** Attribute implant bonuses this clone carries (missing key = +0). */
  implants: Implants;
}

export interface CloneTrainingInput {
  queue: readonly QueueEntryInput[];
  /** A paused queue has no ETA: every finish/total/delta is null. */
  paused?: boolean;
  /** Character attributes without implants. */
  baseAttributes: Attributes;
  clones: readonly CloneInput[];
  wornCloneId: string | number;
  cloneState?: CloneState;
  /** When the queue would start training. */
  now: Date;
  /** When the pilot may next jump; only a time after `now` yields stayThenSwitch. */
  cooldownReadyAt?: Date | null;
}

export interface CloneTrainingFigure {
  finish: Date | null;
  deltaSeconds: number | null;
}

export interface CloneTrainingResult extends CloneTrainingFigure {
  cloneId: string | number;
  totalSeconds: number | null;
  /** Keep training in the worn clone until the cooldown ends, then wear this one. */
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

/** Seconds each queue entry takes wearing `implants` the whole way. */
export function queueEntrySeconds(
  queue: readonly QueueEntryInput[],
  base: Attributes,
  implants: Implants,
  cloneState: CloneState
): number[] {
  return queue.map((e) => timeToTrain(e.remainingSp, entryRate(e, base, implants, cloneState)));
}

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

/** Seconds to finish `queue` wearing `implants` the whole way. */
function queueSeconds(
  queue: readonly QueueEntryInput[],
  base: Attributes,
  implants: Implants,
  cloneState: CloneState
): number {
  return sum(queueEntrySeconds(queue, base, implants, cloneState));
}

/** Seconds each entry takes wearing `stay` for `stayBudget` seconds, then `target`. */
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
