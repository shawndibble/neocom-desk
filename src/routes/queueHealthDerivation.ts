import type { SkillQueueEntry } from '@/esi/endpoints';
import { classifySkillQueue, isQueuePaused } from '@/features/skills/queueStatus';

export type QueueHealthState = 'training' | 'idle' | 'paused' | 'endingSoon' | 'unknown';

/** How close the last queued entry's finish must be to count as "about to run dry". */
const ENDING_SOON_MS = 24 * 60 * 60 * 1000;

/**
 * Cache-only queue-health classification for one character, for the
 * across-every-character view. Built on `isQueuePaused`/`classifySkillQueue`
 * (queueStatus.ts) rather than restating their paused rule: an absent date
 * means paused with an unknown ETA, never "starts now" (peterhaneve/evemon#40).
 */
export function deriveQueueHealth(
  entries: readonly SkillQueueEntry[] | undefined,
  nowMs: number
): QueueHealthState {
  if (entries === undefined) return 'unknown';
  if (entries.length === 0) return 'idle';
  if (isQueuePaused(entries)) return 'paused';

  // classifySkillQueue orders by queue_position, so the last row is the tail
  // of the queue: the one that determines when the character runs dry.
  const classified = classifySkillQueue(entries, nowMs);
  const tail = classified[classified.length - 1];
  if (tail.secondsRemaining === null) return 'idle';

  return tail.secondsRemaining * 1000 <= ENDING_SOON_MS ? 'endingSoon' : 'training';
}
