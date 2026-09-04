// dispatchProjections: the pure decision logic behind the Scheduled Push
// dispatcher (issue #358, ADR 0010, CONTEXT.md round 45). The `onSchedule`
// wiring lives in index.ts, same split as registerDevice.ts/mintFirebaseToken
// — this module never touches Firestore or FCM directly, so it's unit
// testable without an emulator.
//
// A `projections/{occurrenceKey}` doc is one row, not one Character's whole
// window: Firestore cannot query inside an array of maps, and the dispatcher
// needs an indexed `where(fired == false, fireAt <= now)` every run, plus a
// second indexed query to purge long-fired rows. registerDevice.ts's
// wholesale replace becomes, at the storage layer, "delete this character's
// unfired rows, then batch-write the new set" (index.ts).

import { ProjectionRowInput } from './registerDevice.js';

/** One row as stored in the `projections` collection, doc id === occurrenceKey. */
export interface StoredProjectionRow extends ProjectionRowInput {
  characterId: number;
}

/** A row still unfired more than this long past its `fireAt` is deleted unsent, not sent late (CONTEXT round 45). */
export const STALE_UNSENT_MS = 7 * 24 * 3_600_000;

/** A fired row is kept as the backend's half of the Notification Feed, then purged like every other Feed row (round 20/45). */
export const FIRED_RETENTION_MS = 30 * 24 * 3_600_000;

/** `fireAt === nowMs` counts as due — the same inclusive edge `projection.ts`'s `inHorizon` uses at the far boundary. */
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

/**
 * A device token is deleted only on these two FCM error codes — any other
 * error (rate limiting, a transient server error) leaves it alone, since it
 * says nothing about whether the token is still valid (CONTEXT round 45).
 */
export function shouldDeleteDeviceToken(errorCode: string): boolean {
  return (
    errorCode === 'messaging/registration-token-not-registered' ||
    errorCode === 'messaging/invalid-argument'
  );
}

/**
 * The FCM `data` payload for one row — every value a string, per the Admin
 * SDK's `{[key: string]: string}` constraint on webpush data messages. Field
 * names and types match `src/features/notifications/pushHandler.ts`'s
 * `PushPayload` exactly; that module's own docstring records how the nested
 * `data` envelope and the string-typed `characterId` were confirmed against
 * `@firebase/messaging`'s service-worker source.
 */
export function buildPushData(row: StoredProjectionRow): Record<string, string> {
  return {
    characterId: String(row.characterId),
    eventId: row.eventId,
    occurrenceKey: row.occurrenceKey,
    title: row.title,
    body: row.body,
  };
}
