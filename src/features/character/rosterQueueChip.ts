import type { StatChipTone } from '@/components/ui';
import type { QueueInfo } from '@/features/character/rosterView';
import type { CharacterSortStats } from '@/features/character/groups';
import type { QueueState } from '@/engine/skills/queueStatus';

export const UNGROUPED_VALUE = '__ungrouped__';

// `idle` is `warning`, not `default`: the app already raises a
// `characterNotTraining` warning alert for an idle queue, so this chip must
// not disagree with it (issue #1731). `queueChipTone` below overrides that
// back to `default` for the one Character-level opt-out that alert has.
export const QUEUE_STATE_TONE: Record<QueueState, StatChipTone> = {
  training: 'success',
  endingSoon: 'warning',
  paused: 'danger',
  idle: 'warning',
  unknown: 'default',
};

// Same "most-needs-attention first" ordering as PI's ATTENTION_RANK, mapped
// onto training's own tones: paused and idle (both now warning-or-worse)
// share rank 0, then endingSoon, then unknown (no cached queue yet), then
// training last since it needs no attention at all.
export const QUEUE_STATE_RANK: Record<QueueState, number> = {
  paused: 0,
  idle: 0,
  endingSoon: 1,
  unknown: 2,
  training: 3,
};

/**
 * `QUEUE_STATE_TONE`, overridden back to `default` for an idle queue when
 * this Character has muted the `characterNotTraining` alert in its feed
 * channel — the alert's own only per-pilot opt-out (issue #1731), e.g. a
 * deliberately parked alt banking skill points. Every other state ignores
 * the opt-out: it exists to silence the idle warning specifically, not to
 * dim a paused or ending-soon queue.
 */
export function queueChipTone(state: QueueState, notTrainingAlertEnabled: boolean): StatChipTone {
  if (state === 'idle' && !notTrainingAlertEnabled) return 'default';
  return QUEUE_STATE_TONE[state];
}

/** `QUEUE_STATE_RANK`, with the same opt-out override as `queueChipTone` — a muted idle Character sorts with `unknown`, not with `paused`, so its position agrees with its now-neutral chip. */
export function queueChipRank(state: QueueState, notTrainingAlertEnabled: boolean): number {
  if (state === 'idle' && !notTrainingAlertEnabled) return QUEUE_STATE_RANK.unknown;
  return QUEUE_STATE_RANK[state];
}

/**
 * The staler of two optional fetch times — the card's one combined age badge
 * reads as "how stale is the worst part of this card", never the freshest
 * field alone, so it can't imply everything is fresher than it is.
 */
export function olderOf(a: Date | null | undefined, b: Date | null | undefined): Date | undefined {
  if (!a) return b ?? undefined;
  if (!b) return a;
  return a.getTime() <= b.getTime() ? a : b;
}

/** The one "how stale is this character" rule (`olderOf`'s doc comment) — shared by the card badge and the table's `lastSynced` column so they can't drift into disagreeing about the same character. */
export function characterLastSynced(
  stats: CharacterSortStats | undefined,
  queue: QueueInfo | undefined
): Date | undefined {
  return olderOf(olderOf(stats?.skillPointsFetchedAt, stats?.walletFetchedAt), queue?.fetchedAt);
}
