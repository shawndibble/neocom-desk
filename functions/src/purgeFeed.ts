import { FIRED_RETENTION_MS } from './dispatchProjections.js';

export const NOTIFICATION_FEED_COLLECTION = 'notificationFeed';

export const FEED_PURGE_BATCH_SIZE = 500;

export const FEED_PURGE_MAX_PASSES = 20;

export function feedPurgeCutoff(nowMs: number, retentionMs: number = FIRED_RETENTION_MS): number {
  return nowMs - retentionMs;
}

export function isPurgeableFeedRow(
  firedAt: number,
  nowMs: number,
  retentionMs: number = FIRED_RETENTION_MS
): boolean {
  return firedAt < feedPurgeCutoff(nowMs, retentionMs);
}
