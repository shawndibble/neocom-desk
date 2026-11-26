import { SCHEDULED_STOP_REASONS, type ScheduledStopReason } from './scheduledSync';

export type SyncStoppedAlertReason = Exclude<ScheduledStopReason, 'book-off'>;

export const SYNC_STOPPED_ALERT_REASONS: readonly SyncStoppedAlertReason[] =
  SCHEDULED_STOP_REASONS.filter((r): r is SyncStoppedAlertReason => r !== 'book-off');

export interface CorpTaxBookSyncStoppedFire {
  eventId: 'corpTaxBookSyncStopped';
  characterId: number;
  corporationId: number;
  reason: SyncStoppedAlertReason;
  characterName: string;
  stoppedAt: number;
}
