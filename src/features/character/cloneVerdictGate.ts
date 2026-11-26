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

export const CLONE_NOTE_KEY: Record<CloneVerdictNote, string> = {
  implants: 'Implants',
  queue: 'Queue',
  paused: 'Paused',
  empty: 'Empty',
  attributes: 'Attributes',
};

export type ReadyCloneVerdict = Omit<CloneVerdictResult, 'verdict'> & {
  verdict: Exclude<CloneVerdict, { kind: 'none' }>;
};

export type CloneVerdictGate =
  { kind: 'note'; note: CloneVerdictNote } | { kind: 'verdict'; result: ReadyCloneVerdict };

export interface CloneVerdictGateInput {
  wornImplantsRead: boolean;
  queue: readonly SkillQueueEntry[] | null;
  training: CloneTrainingData | null;
}

export function cloneVerdictGate(
  input: CloneVerdictGateInput,
  verdictResult: CloneVerdictResult | null
): CloneVerdictGate | null {
  const note = (n: CloneVerdictNote): CloneVerdictGate => ({ kind: 'note', note: n });
  if (!input.wornImplantsRead) return note('implants');
  if (input.queue === null) return note('queue');
  if (isQueuePaused(input.queue)) return note('paused');
  if (input.queue.length === 0) return note('empty');
  if (input.training === null) return note('attributes');
  if (input.training.paused) return note('paused');
  if (!verdictResult) return null;
  const { verdict } = verdictResult;
  if (verdict.kind === 'none') return note('empty');
  return { kind: 'verdict', result: { ...verdictResult, verdict } };
}

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
