import type { ProjectionRowInput } from './projectionRow.js';

export interface StoredProjectionRow extends ProjectionRowInput {
  characterId: number;
  deviceId?: string;
}

export function isHourlyTick(nowMs: number): boolean {
  return new Date(nowMs).getUTCMinutes() < 15;
}

export const STALE_UNSENT_MS = 7 * 24 * 3_600_000;

export const FIRED_RETENTION_MS = 30 * 24 * 3_600_000;

export function isDue(row: Pick<StoredProjectionRow, 'fireAt'>, nowMs: number): boolean {
  return row.fireAt <= nowMs;
}

export function isStaleUnsent(
  row: Pick<StoredProjectionRow, 'fireAt'>,
  nowMs: number,
  staleMs: number = STALE_UNSENT_MS
): boolean {
  return nowMs - row.fireAt > staleMs;
}

export function isPastRetention(
  firedAt: number,
  nowMs: number,
  retentionMs: number = FIRED_RETENTION_MS
): boolean {
  return nowMs - firedAt > retentionMs;
}

export function shouldDeleteDeviceToken(errorCode: string, errorMessage = ''): boolean {
  return (
    errorCode === 'messaging/registration-token-not-registered' ||
    errorCode === 'messaging/invalid-registration-token' ||
    (errorCode === 'messaging/invalid-argument' && /registration token/i.test(errorMessage))
  );
}

export function buildPushData(row: StoredProjectionRow): Record<string, string> {
  return {
    characterId: String(row.characterId),
    eventId: row.eventId,
    occurrenceKey: row.occurrenceKey,
    title: row.title,
    body: row.body,
    fireAt: String(row.fireAt),
    ...(row.eveType !== undefined ? { eveType: row.eveType } : {}),
  };
}
