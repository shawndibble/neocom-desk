import {
  cloneTrainingTimes,
  queueEntrySeconds,
  stayThenSwitchEntrySeconds,
  type CloneTrainingInput,
} from './cloneTrainingTime';
import type { AttributeName, Implants } from './types';

/**
 * Which clone is best for the active training queue, and is jumping worth it?
 * Counts attribute implants only (whatever `implants` carries) and compares
 * staying against jumping when the cooldown allows, never against an instant
 * jump the pilot cannot make. Pure: built on `cloneTrainingTimes`.
 */

/** A saving under this reads as "stay put": not worth the jump and the cooldown it starts. */
export const MIN_JUMP_GAIN_SECONDS = 60;

export interface VerdictSegment {
  skillTypeID: number;
  seconds: number;
}

export interface CloneRow {
  cloneId: string | number;
  /** Queue time wearing this clone the whole way; null for a paused queue. */
  totalSeconds: number | null;
  /** Against the worn clone, jump-when-allowed under a cooldown. Negative = sooner. */
  deltaSeconds: number | null;
}

export type CloneVerdict =
  | { kind: 'none'; reason: 'empty' | 'paused' }
  | {
      kind: 'stay';
      stay: VerdictSegment[];
      /** The nearest rival and how much longer it would take; null when there is none. */
      closest: { cloneId: string | number; extraSeconds: number } | null;
    }
  | {
      kind: 'jump';
      cloneId: string | number;
      savedSeconds: number;
      /** Attributes the queue trains on that the destination boosts more than the worn clone. */
      attributes: AttributeName[];
      stay: VerdictSegment[];
      best: VerdictSegment[];
      /** Set while the cooldown runs: when the jump becomes possible. */
      cooldownReadyAt: Date | null;
    };

export interface CloneVerdictResult {
  verdict: CloneVerdict;
  rows: CloneRow[];
  /** The clone to badge; the worn one when staying. Null with no verdict. */
  bestCloneId: string | number | null;
}

const ATTRIBUTES: AttributeName[] = [
  'intelligence',
  'memory',
  'perception',
  'willpower',
  'charisma',
];

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

export function cloneVerdict(input: CloneTrainingInput): CloneVerdictResult {
  const { queue, clones, wornCloneId, baseAttributes, now, cooldownReadyAt } = input;
  const cloneState = input.cloneState ?? 'omega';
  const rows: CloneRow[] = cloneTrainingTimes(input).map((t) => ({
    cloneId: t.cloneId,
    totalSeconds: t.totalSeconds,
    deltaSeconds: (t.stayThenSwitch ?? t).deltaSeconds,
  }));
  if (input.paused) {
    return { verdict: { kind: 'none', reason: 'paused' }, rows, bestCloneId: null };
  }
  if (queue.length === 0) {
    return { verdict: { kind: 'none', reason: 'empty' }, rows, bestCloneId: null };
  }

  const worn = clones.find((c) => c.id === wornCloneId)!;
  const readyAt =
    cooldownReadyAt && cooldownReadyAt.getTime() > now.getTime() ? cooldownReadyAt : null;
  const budget = readyAt ? (readyAt.getTime() - now.getTime()) / 1000 : 0;
  const segmentsFor = (implants: Implants): VerdictSegment[] =>
    (readyAt
      ? stayThenSwitchEntrySeconds(
          queue,
          baseAttributes,
          worn.implants,
          implants,
          cloneState,
          budget
        )
      : queueEntrySeconds(queue, baseAttributes, implants, cloneState)
    ).map((seconds, i) => ({ skillTypeID: queue[i].skillTypeID, seconds }));

  const stay = segmentsFor(worn.implants);
  const stayTotal = sum(stay.map((s) => s.seconds));
  const rivals = clones
    .filter((c) => c.id !== wornCloneId)
    .map((c) => {
      const segments = segmentsFor(c.implants);
      return { clone: c, segments, total: sum(segments.map((s) => s.seconds)) };
    })
    .sort((a, b) => a.total - b.total);
  const top = rivals[0];

  if (top && stayTotal - top.total >= MIN_JUMP_GAIN_SECONDS) {
    const weight = (a: AttributeName) =>
      sum(
        queue.map(
          (e) => (e.primary === a ? e.remainingSp : 0) + (e.secondary === a ? e.remainingSp / 2 : 0)
        )
      );
    const attributes = ATTRIBUTES.filter(
      (a) => (top.clone.implants[a] ?? 0) > (worn.implants[a] ?? 0) && weight(a) > 0
    ).sort((a, b) => weight(b) - weight(a));
    return {
      verdict: {
        kind: 'jump',
        cloneId: top.clone.id,
        savedSeconds: stayTotal - top.total,
        attributes,
        stay,
        best: top.segments,
        cooldownReadyAt: readyAt,
      },
      rows,
      bestCloneId: top.clone.id,
    };
  }
  return {
    verdict: {
      kind: 'stay',
      stay,
      closest: top ? { cloneId: top.clone.id, extraSeconds: top.total - stayTotal } : null,
    },
    rows,
    bestCloneId: wornCloneId,
  };
}
