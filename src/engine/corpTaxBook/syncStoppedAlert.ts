/**
 * The fire of `corpTaxBookSyncStopped` (issue #6208): the scheduled server sync stopped a Corp Tax
 * Book's Automatic sync. The backend builds it when it stops the schedule and pushes it to the
 * book's editors (ADR 0027; `functions/src/serverEvents.ts` mirrors this shape); nothing on the
 * device polls for it.
 */
import { SCHEDULED_STOP_REASONS, type ScheduledStopReason } from './scheduledSync';

/**
 * Why a stop is told: every stop reason but `book-off`, which an editor did on purpose
 * (server: `SyncStoppedAlertReason` in functions/src/serverEvents.ts).
 */
export type SyncStoppedAlertReason = Exclude<ScheduledStopReason, 'book-off'>;

/** Derived, so a stop reason added to the mirrored list is told rather than dropped by the guard. */
export const SYNC_STOPPED_ALERT_REASONS: readonly SyncStoppedAlertReason[] =
  SCHEDULED_STOP_REASONS.filter((r): r is SyncStoppedAlertReason => r !== 'book-off');

export interface CorpTaxBookSyncStoppedFire {
  eventId: 'corpTaxBookSyncStopped';
  /** The editor the push is for. */
  characterId: number;
  corporationId: number;
  reason: SyncStoppedAlertReason;
  /** The holder's name, for the reason's wording. */
  characterName: string;
  /** The stored status's `stoppedAt`: a schedule turned on again and stopped again is another. */
  stoppedAt: number;
}
