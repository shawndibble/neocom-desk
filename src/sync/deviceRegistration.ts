/**
 * Web Push device registration (issue #356, ADR 0010).
 *
 * Whether to offer the flow at all is `webPushSupport.ts`, a pure read of the
 * environment kept apart so the startup bundle can ask it without loading
 * Firebase. This module *is* Firebase: reach it only through `await
 * import(...)` from anything the startup bundle reaches
 * (`app/bootImportGraph.test.ts`).
 *
 * `registerDeviceForWebPush` is the one-call orchestration: acquire an FCM
 * token, gather every stored Character's access token (already cached by
 * `auth/session.ts`), and hand the batch to the `registerDevice` callable.
 * The Enable tap's call must happen in the same user gesture as the
 * permission grant — Safari requires the FCM/permission dance to happen in
 * one, and this is also the point at which an iOS user must already have
 * installed the PWA.
 */
import { deleteToken, getMessaging, getToken } from 'firebase/messaging';
import { getValidAccessToken } from '@/auth/session';
import { db } from '@/db';
import type { ProjectionRow } from '@/engine/projection';
import { getFirebaseApp } from './firebaseApp';
import { callRouted } from './routedCallable';
import { getDeviceId } from './deviceId';
import { readLocal, removeLocal, writeLocal } from '@/lib/safeLocalStorage';
import type { QuietHoursPayload } from '@/features/notifications/quietTime';
import type { ServerEventRegistration } from '@/features/notifications/serverEvents';

interface RegisterDeviceResponse {
  deviceId: string;
  registered: number[];
  rejected: number[];
  /** Per Character (id as a string): the ESI types the server has seen. Absent from an older deployed function. */
  seenTypes?: Record<string, string[]>;
}

/** No Projection to upload for a Character this call doesn't mention. */
const NO_PROJECTION_ROWS: readonly ProjectionRow[] = [];
const NO_EVE_TYPES: readonly string[] = [];
const NO_SERVER_EVENTS: ServerEventRegistration = { serverEvents: [], serverInputs: {} };

/**
 * How long an unchanged registration is trusted before the poll re-sends it
 * anyway (issue #2265). Skipping is safe only because Projections are per
 * device (issue #2240): no other device can overwrite this device's rows, so
 * the fingerprint below covers everything this device owns on the server.
 *
 * Nothing expires a device doc on `updatedAt`, and the 7-day stale-unsent
 * purge (keyed on `fireAt`) is far outside this window. But the client can't
 * read `deviceRegistrations`, so server-side changes it can't see stay
 * unrepaired until this cap forces an upload — kept short (an hour still
 * skips all but one poll in twelve) because of two such cases:
 *
 * - a spurious FCM "unregistered"/"invalid token" reply for a token that is
 *   in fact still live: `dispatchDueProjections`
 *   (`functions/src/projectionStore.ts`) deletes the registration, then
 *   orphan-deletes every row this device uploaded. The token is unchanged,
 *   so the fingerprint still matches and only this cap brings it back;
 * - a duplicated deviceId (a cloned browser profile, or copied site data):
 *   two installs share one registration doc and one set of rows, each upload
 *   overwriting the other's token and Projection without either noticing.
 */
export const REREGISTER_AFTER_MS = 3_600_000;

/** Device-local, never synced: what this device last registered, and when. */
const LAST_REGISTRATION_KEY = 'neocom.lastPushRegistration';

interface LastRegistration {
  fingerprint: string;
  at: number;
}

function readLastRegistration(): LastRegistration | undefined {
  const raw = readLocal(LAST_REGISTRATION_KEY);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Partial<LastRegistration>;
    return typeof parsed.fingerprint === 'string' && typeof parsed.at === 'number'
      ? { fingerprint: parsed.fingerprint, at: parsed.at }
      : undefined;
  } catch {
    return undefined;
  }
}

function writeLastRegistration(value: LastRegistration | undefined): void {
  // Storage blocked (private mode): every poll just re-registers, as before.
  if (value) writeLocal(LAST_REGISTRATION_KEY, JSON.stringify(value));
  else removeLocal(LAST_REGISTRATION_KEY);
}

/** cyrb53 — a short, stable digest so a 72-hour Projection isn't stored verbatim. */
function digest(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/**
 * Everything the callable would change on the backend: which token reaches
 * which Characters, and each one's Projection. Order-insensitive, so a rebuild
 * that finds the same rows in another order doesn't count as a change.
 */
function registrationFingerprint(
  fcmToken: string,
  characterIds: readonly number[],
  projectionsByCharacter: ReadonlyMap<number, readonly ProjectionRow[]>,
  eveTypesByCharacter: ReadonlyMap<number, readonly string[]>,
  serverEventsByCharacter: ReadonlyMap<number, ServerEventRegistration>,
  quietHours: QuietHoursPayload | null
): string {
  const characters = [...characterIds]
    .sort((a, b) => a - b)
    .map((characterId) => [
      characterId,
      [...(projectionsByCharacter.get(characterId) ?? NO_PROJECTION_ROWS)]
        .sort((a, b) =>
          a.occurrenceKey < b.occurrenceKey ? -1 : a.occurrenceKey > b.occurrenceKey ? 1 : 0
        )
        .map((row) => [
          row.occurrenceKey,
          row.eventId,
          row.fireAt,
          row.title,
          row.body,
          row.eveType ?? null,
        ]),
      [...(eveTypesByCharacter.get(characterId) ?? NO_EVE_TYPES)].sort(),
      serverEventsByCharacter.get(characterId) ?? NO_SERVER_EVENTS,
    ]);
  return digest(JSON.stringify([getDeviceId(), fcmToken, characters, quietHours]));
}

/**
 * Uploads from this tab currently awaiting the callable, and whether two of
 * them have overlapped since the count was last zero.
 */
let inFlight = 0;
let overlapped = false;

export interface RegisterDeviceOptions {
  /**
   * Skip the whole registration — every Character's access-token refresh and
   * the callable — when this device already registered the same FCM token,
   * roster and Projections within {@link REREGISTER_AFTER_MS}. The 5-minute
   * Foreground Poller sets this; the Enable tap does not, so a user-initiated
   * enable always reaches the backend.
   */
  skipIfUnchanged?: boolean;
  /**
   * Each Character's browser-enabled ESI types (issue #3755, ADR 0020),
   * replacing this device's previous list server-side. A Character with no
   * entry uploads an empty list. Part of the fingerprint, so changing a
   * toggle is never skipped.
   */
  eveTypesByCharacter?: ReadonlyMap<number, readonly string[]>;
  /**
   * This device's quiet time (issue #4566), enforced by the server when it
   * pushes. `null` (the default) sends no window, which clears a stored one.
   * Part of the fingerprint, so changing it is never skipped. An older
   * deployed function ignores the field.
   */
  quietHours?: QuietHoursPayload | null;
  /**
   * Each Character's server-pushed events and their inputs (issue #5121): sent
   * as `serverEvents` / `serverInputs` beside `eveTypes`, replacing this
   * device's previous ones. A Character with no entry uploads empty ones. Part
   * of the fingerprint. A function deployed before #5121 ignores both fields
   * (its parser reads only the keys it knows), so the upload is safe either way.
   */
  serverEventsByCharacter?: ReadonlyMap<number, ServerEventRegistration>;
}

/**
 * Acquire an FCM token and register this device against every Character
 * currently stored on it. Returns `null` (not an error) when there is
 * nothing to register — no FCM token available, or no Character stored yet —
 * both ordinary, non-exceptional states.
 *
 * `projectionsByCharacter` is this call's Scheduled Push upload (issue #358,
 * ADR 0010, GLOSSARY.md round 45): each Character's whole 72-hour Projection
 * window, replacing whatever this device previously uploaded for that
 * Character wholesale — never another device's rows (issue #2240).
 * A Character with no entry here (the default, an empty map) uploads an empty
 * Projection — correct for a caller with nothing projectable to say, and for
 * every call site before this ticket wired one up.
 */
export async function registerDeviceForWebPush(
  vapidKey: string,
  serviceWorkerRegistration: ServiceWorkerRegistration,
  projectionsByCharacter: ReadonlyMap<number, readonly ProjectionRow[]> = new Map(),
  {
    skipIfUnchanged = false,
    eveTypesByCharacter = new Map(),
    serverEventsByCharacter = new Map(),
    quietHours = null,
  }: RegisterDeviceOptions = {}
): Promise<RegisterDeviceResponse | null> {
  // Checked before `getToken`: a late rebuild on an emptied roster (after
  // Remove / Log out) must not mint a fresh FCM token just to discard it.
  const characters = await db.characters.toArray();
  if (characters.length === 0) return null;

  const messaging = getMessaging(getFirebaseApp());
  const fcmToken = await getToken(messaging, { vapidKey, serviceWorkerRegistration });
  if (!fcmToken) return null;

  // The roster can empty while `getToken` awaits (Remove / Log out ran its
  // `deleteToken` before this token existed): drop the token just minted.
  if ((await db.characters.toArray()).length === 0) {
    await deleteToken(messaging).catch(() => {});
    return null;
  }

  const fingerprint = registrationFingerprint(
    fcmToken,
    characters.map((character) => character.characterId),
    projectionsByCharacter,
    eveTypesByCharacter,
    serverEventsByCharacter,
    quietHours
  );
  const now = Date.now();
  if (skipIfUnchanged) {
    const last = readLastRegistration();
    if (last?.fingerprint === fingerprint && now - last.at < REREGISTER_AFTER_MS) return null;
  }

  // A stale/expired token for one Character must not stop the others from
  // registering — settle each independently rather than Promise.all, which
  // would reject (and register nobody) on the first failure. Mirrors the
  // backend's own per-character partial-success design (registerDevice.ts).
  const tokenAttempts = await Promise.allSettled(
    characters.map(async (character) => ({
      characterId: character.characterId,
      accessToken: await getValidAccessToken(character.characterId),
    }))
  );
  const withAccessTokens = tokenAttempts
    .filter(
      (attempt): attempt is PromiseFulfilledResult<{ characterId: number; accessToken: string }> =>
        attempt.status === 'fulfilled'
    )
    .map((attempt) => attempt.value);
  if (withAccessTokens.length === 0) return null;

  type RegisterDeviceRequest = {
    deviceId: string;
    fcmToken: string;
    characters: {
      characterId: number;
      accessToken: string;
      projectionRows: readonly ProjectionRow[];
      eveTypes: readonly string[];
      serverEvents: readonly string[];
      serverInputs: ServerEventRegistration['serverInputs'];
    }[];
    quietHours: QuietHoursPayload | null;
  };

  // Forgotten before the call, whatever its outcome: this upload replaces
  // this device's rows, so once it may have landed the previous fingerprint
  // no longer describes the server. An Enable tap (empty Projection) that
  // came back partial or threw after committing would otherwise let the next
  // polls skip over a server holding none of this device's rows.
  writeLastRegistration(undefined);
  inFlight += 1;
  if (inFlight > 1) overlapped = true;
  try {
    const result = await callRouted<RegisterDeviceRequest, RegisterDeviceResponse>(
      'registerDevice',
      {
        deviceId: getDeviceId(),
        fcmToken,
        quietHours,
        characters: withAccessTokens.map((character) => ({
          ...character,
          projectionRows: projectionsByCharacter.get(character.characterId) ?? NO_PROJECTION_ROWS,
          eveTypes: eveTypesByCharacter.get(character.characterId) ?? NO_EVE_TYPES,
          ...(serverEventsByCharacter.get(character.characterId) ?? NO_SERVER_EVENTS),
        })),
      },
      // Each Character is proven by its own access token in the payload: no session.
      undefined
    );
    // Remembered only when every Character landed: one that couldn't get a
    // token, or that the backend rejected, must be retried on the next poll
    // rather than left unregistered for REREGISTER_AFTER_MS. Nor when another
    // upload overlapped this one — the server may have committed them in
    // either order, so neither fingerprint is known to be the one it holds.
    if (
      !overlapped &&
      withAccessTokens.length === characters.length &&
      result.rejected.length === 0
    ) {
      writeLastRegistration({ fingerprint, at: now });
    }
    return result;
  } finally {
    inFlight -= 1;
    if (inFlight === 0) overlapped = false;
  }
}

/**
 * Drop this device's FCM token so the backend can no longer push to it — the
 * counterpart of `registerDeviceForWebPush` for when the last Character
 * leaves this device (Remove / Log out). Only this device's own registration
 * is touched; other devices keep theirs.
 */
export async function unregisterDeviceForWebPush(): Promise<void> {
  writeLastRegistration(undefined);
  await deleteToken(getMessaging(getFirebaseApp()));
}
