/**
 * What stands between the pilot and a Clone verdict, in the order it should be
 * said: shared by the Clones page's verdict card and the Overview's Best clone
 * widget so the two can never disagree about why there is no answer.
 *
 * Pure: the page and the widget each do their own loading and routing; this is
 * only the precedence (an unreadable implant list, then queue, then a paused or
 * empty queue, then an unreadable attribute sheet) and the comparison call.
 */
import {
  cloneVerdict,
  type CloneVerdict,
  type CloneVerdictResult,
} from '@/engine/clone/cloneVerdict';
import type { CloneState } from '@/engine/types';
import type { SkillQueueEntry } from '@/esi/endpoints';
import { isQueuePaused } from '@/engine/skills/queueStatus';
import { WORN_CLONE_ID, type CloneTrainingData } from './cloneTraining';

export type CloneVerdictNote = 'implants' | 'queue' | 'paused' | 'empty' | 'attributes';

/** The i18n suffix of each reason there is no verdict (`clones.verdict.note<Suffix>`). */
export const CLONE_NOTE_KEY: Record<CloneVerdictNote, string> = {
  implants: 'Implants',
  queue: 'Queue',
  paused: 'Paused',
  empty: 'Empty',
  attributes: 'Attributes',
};

/** A verdict that says something: stay or jump ("none" is a note, not a verdict). */
export type ReadyCloneVerdict = Omit<CloneVerdictResult, 'verdict'> & {
  verdict: Exclude<CloneVerdict, { kind: 'none' }>;
};

export type CloneVerdictGate =
  { kind: 'note'; note: CloneVerdictNote } | { kind: 'verdict'; result: ReadyCloneVerdict };

export interface CloneVerdictGateInput {
  /** The worn clone's implants were readable. */
  wornImplantsRead: boolean;
  /** The active queue; null when it could not be read. */
  queue: readonly SkillQueueEntry[] | null;
  /** Null when the attribute sheet could not be read. */
  training: CloneTrainingData | null;
}

/**
 * The note to show instead of a verdict, the verdict itself, or null while the
 * verdict has not been worked out yet (nothing to say, not even a reason).
 */
export function cloneVerdictGate(
  input: CloneVerdictGateInput,
  verdictResult: CloneVerdictResult | null
): CloneVerdictGate | null {
  const note = (n: CloneVerdictNote): CloneVerdictGate => ({ kind: 'note', note: n });
  if (!input.wornImplantsRead) return note('implants');
  if (input.queue === null) return note('queue');
  // The queue's own state outranks an unreadable sheet: an empty queue needs no attributes.
  if (isQueuePaused(input.queue)) return note('paused');
  if (input.queue.length === 0) return note('empty');
  if (input.training === null) return note('attributes');
  if (input.training.paused) return note('paused');
  if (!verdictResult) return null;
  const { verdict } = verdictResult;
  if (verdict.kind === 'none') return note('empty');
  return { kind: 'verdict', result: { ...verdictResult, verdict } };
}

/** Compares the worn clone against every jump clone for the queue; null when there is nothing to compare. */
export function runCloneVerdict(
  training: CloneTrainingData | null,
  cloneState: CloneState,
  loadedAtMs: number,
  cooldownReadyAt: Date | null
): CloneVerdictResult | null {
  if (!training || training.paused) return null;
  return cloneVerdict({
    queue: training.queue,
    baseAttributes: training.baseAttributes,
    clones: training.clones,
    wornCloneId: WORN_CLONE_ID,
    cloneState,
    now: new Date(loadedAtMs),
    cooldownReadyAt,
  });
}
