import type { StatChipTone } from '@/components/ui';
import type { QueueInfo } from '@/features/character/rosterView';
import type { CharacterSortStats } from '@/features/character/groups';
import type { QueueState } from '@/engine/skills/queueStatus';

export const UNGROUPED_VALUE = '__ungrouped__';

export const QUEUE_STATE_TONE: Record<QueueState, StatChipTone> = {
  training: 'success',
  endingSoon: 'warning',
  paused: 'danger',
  idle: 'warning',
  unknown: 'warning',
};

export const QUEUE_STATE_RANK: Record<QueueState, number> = {
  paused: 0,
  idle: 0,
  endingSoon: 1,
  unknown: 2,
  training: 3,
};

export function queueChipTone(state: QueueState, notTrainingAlertEnabled: boolean): StatChipTone {
  if (state === 'idle' && !notTrainingAlertEnabled) return 'default';
  return QUEUE_STATE_TONE[state];
}

export function queueChipRank(state: QueueState, notTrainingAlertEnabled: boolean): number {
  if (state === 'idle' && !notTrainingAlertEnabled) return QUEUE_STATE_RANK.unknown;
  return QUEUE_STATE_RANK[state];
}

export function olderOf(a: Date | null | undefined, b: Date | null | undefined): Date | undefined {
  if (!a) return b ?? undefined;
  if (!b) return a;
  return a.getTime() <= b.getTime() ? a : b;
}

export function characterLastSynced(
  stats: CharacterSortStats | undefined,
  queue: QueueInfo | undefined
): Date | undefined {
  return olderOf(olderOf(stats?.skillPointsFetchedAt, stats?.walletFetchedAt), queue?.fetchedAt);
}
