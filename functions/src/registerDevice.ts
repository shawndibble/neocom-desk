// registerDevice: register one device's FCM token against every Character it
// holds, in one call. See issue #356, ADR 0010, CONTEXT.md round 44/45
// ("Projections and device registrations are uploaded through one callable").
//
// Verification is per-Character rather than all-or-nothing: a device can hold
// several Characters, and one stale/expired access token among them (a
// Character the user hasn't opened in a while) should not stop the others
// from registering. A rejected character is simply left out of the written
// `characterIds` and reported back — never written under an id its token did
// not verify to, which is what stops a caller from claiming a characterId it
// doesn't hold.

import { verifyEveAccessToken, type VerifyOptions } from './verifyEveToken.js';

/**
 * One Scheduled Push occurrence (issue #358, ADR 0010), as uploaded by the
 * client. Mirrors `src/engine/projection.ts`'s `ProjectionRow` but is kept as
 * its own local type rather than imported: this package holds no SDE and no
 * i18n catalog, and never re-derives what the fields mean — it only stores
 * and later replays already-rendered text, so `eventId` is validated as a
 * non-empty string here, not against the frontend's closed event-id union.
 */
export interface ProjectionRowInput {
  eventId: string;
  occurrenceKey: string;
  fireAt: number;
  title: string;
  body: string;
}

export interface DeviceCharacterInput {
  characterId: number;
  accessToken: string;
  /** This Character's whole 72-hour Projection window — replaces the previous one wholesale (round 45). */
  projectionRows: ProjectionRowInput[];
}

export interface RegisterDeviceInput {
  deviceId: string;
  fcmToken: string;
  characters: DeviceCharacterInput[];
}

export interface DeviceRegistrationDoc {
  fcmToken: string;
  /** Replaces the previous value wholesale — never merged (see docstring above). */
  characterIds: number[];
}

/** One verified character's Projection rows, ready to write to the `projections` collection. */
export interface CharacterProjection {
  characterId: number;
  rows: ProjectionRowInput[];
}

export interface RegisterDeviceResult {
  registration: DeviceRegistrationDoc;
  /** characterIds whose access token did not verify (or verified to a different character). */
  rejected: number[];
  /**
   * Projection rows for verified characters only — a rejected character's
   * rows are dropped for the same reason its characterId is: never written
   * under an id its token did not verify to.
   */
  projections: CharacterProjection[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseProjectionRow(raw: unknown, path: string): ProjectionRowInput {
  if (!isRecord(raw)) throw new Error(`${path} must be an object`);
  const { eventId, occurrenceKey, fireAt, title, body } = raw;
  if (typeof eventId !== 'string' || eventId.length === 0) {
    throw new Error(`${path}.eventId (non-empty string) is required`);
  }
  if (typeof occurrenceKey !== 'string' || occurrenceKey.length === 0) {
    throw new Error(`${path}.occurrenceKey (non-empty string) is required`);
  }
  if (typeof fireAt !== 'number' || !Number.isFinite(fireAt)) {
    throw new Error(`${path}.fireAt (number) is required`);
  }
  if (typeof title !== 'string' || title.length === 0) {
    throw new Error(`${path}.title (non-empty string) is required`);
  }
  if (typeof body !== 'string') {
    throw new Error(`${path}.body (string) is required`);
  }
  return { eventId, occurrenceKey, fireAt, title, body };
}

/** Validate the callable's raw `request.data`. Throws a plain Error on any shape violation. */
export function parseRegisterDeviceInput(data: unknown): RegisterDeviceInput {
  if (!isRecord(data)) throw new Error('Request body must be an object');

  const { deviceId, fcmToken, characters } = data;
  if (typeof deviceId !== 'string' || deviceId.length === 0) {
    throw new Error('deviceId (non-empty string) is required');
  }
  if (typeof fcmToken !== 'string' || fcmToken.length === 0) {
    throw new Error('fcmToken (non-empty string) is required');
  }
  if (!Array.isArray(characters) || characters.length === 0) {
    throw new Error('characters (non-empty array) is required');
  }

  const parsedCharacters = characters.map((entry, i) => {
    if (!isRecord(entry)) throw new Error(`characters[${i}] must be an object`);
    const { characterId, accessToken, projectionRows } = entry;
    if (typeof characterId !== 'number' || !Number.isFinite(characterId)) {
      throw new Error(`characters[${i}].characterId must be a number`);
    }
    if (typeof accessToken !== 'string' || accessToken.length === 0) {
      throw new Error(`characters[${i}].accessToken (non-empty string) is required`);
    }
    if (!Array.isArray(projectionRows)) {
      throw new Error(`characters[${i}].projectionRows (array) is required`);
    }
    const rows = projectionRows.map((row, j) =>
      parseProjectionRow(row, `characters[${i}].projectionRows[${j}]`)
    );
    return { characterId, accessToken, projectionRows: rows };
  });

  return { deviceId, fcmToken, characters: parsedCharacters };
}

/**
 * Verify every Character's access token and build the registration doc from
 * whichever pass. Never throws on a per-character verification failure — see
 * module docstring; `logError` receives no token material (only characterId
 * and the failure message), per ADR 0001.
 */
export async function buildDeviceRegistration(
  input: RegisterDeviceInput,
  verifyOptions: VerifyOptions,
  logError: (message: string, meta: unknown) => void = () => {}
): Promise<RegisterDeviceResult> {
  const characterIds: number[] = [];
  const rejected: number[] = [];
  const projections: CharacterProjection[] = [];

  for (const character of input.characters) {
    try {
      const claims = await verifyEveAccessToken(character.accessToken, verifyOptions);
      if (claims.characterId !== character.characterId) {
        throw new Error('Access token verified to a different characterId than claimed');
      }
      characterIds.push(character.characterId);
      projections.push({ characterId: character.characterId, rows: character.projectionRows });
    } catch (err) {
      logError('Device registration: character access token rejected', {
        characterId: character.characterId,
        error: err instanceof Error ? err.message : String(err),
      });
      rejected.push(character.characterId);
    }
  }

  return {
    registration: { fcmToken: input.fcmToken, characterIds },
    rejected,
    projections,
  };
}
