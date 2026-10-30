// registerDevice: register one device's FCM token against every Character it
// holds, in one call. See issue #356, ADR 0010, GLOSSARY.md round 44/45
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
import type { ProjectionRowInput } from './projectionRow.js';
import { parseQuietHours, type QuietHours } from './quietHours.js';
import { parseServerEvents, parseServerInputs, type ServerEventInputs } from './serverEvents.js';
import type { NearbyRouteRules } from './nearbyAlerts.js';
import { isPlainRecord, isRecord } from './guards.js';

export type { ProjectionRowInput };

export interface DeviceCharacterInput {
  characterId: number;
  accessToken: string;
  /**
   * This Character's whole 72-hour Projection window, as this device sees it —
   * replaces this device's previous rows for the Character wholesale, never
   * another device's (issue #2240).
   */
  projectionRows: ProjectionRowInput[];
  /**
   * The raw ESI notification types this device has enabled for the browser
   * channel for this Character (issue #3755, ADR 0020). Replaces this
   * device's own previous list; never another device's. Absent (an older
   * client) leaves the stored list untouched.
   */
  eveTypes?: string[];
  /**
   * The server-pushed Notification Events (issue #5121) this device enabled
   * for the browser channel for this Character: sorted, de-duplicated ids.
   * Same per-device rule as `eveTypes`; absent (an older client) leaves the
   * stored list untouched. Ids this server does not handle are stored anyway.
   */
  serverEvents?: string[];
  /** What the server needs to evaluate them (price targets, the ship-lost minimum). Absent keeps the stored inputs. */
  serverInputs?: ServerEventInputs;
}

/** Bounds a hostile or buggy client's `eveTypes` upload; the real list is a few dozen. */
export const MAX_EVE_TYPES = 200;
const MAX_EVE_TYPE_LENGTH = 100;

export interface RegisterDeviceInput {
  deviceId: string;
  fcmToken: string;
  characters: DeviceCharacterInput[];
  /**
   * This device's quiet time (issue #4566). Absent (an older client) leaves the
   * stored window untouched; `null` clears it.
   */
  quietHours?: QuietHours | null;
  /**
   * This device's Travel Settings, as the nearby-alerts poller counts jumps
   * under them (issue #5122). Absent (an older client, or a value that does not
   * parse) leaves the stored rules untouched.
   */
  routeRules?: NearbyRouteRules;
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
  /** Each verified character's enabled browser types, keyed by characterId; absent when the client sent none. */
  eveTypesByCharacter: Record<number, string[]>;
  /** Each verified character's server-pushed event ids; absent when the client sent none. */
  serverEventsByCharacter: Record<number, string[]>;
  /** Each verified character's server inputs; absent when the client sent none. */
  serverInputsByCharacter: Record<number, ServerEventInputs>;
}

function parseProjectionRow(raw: unknown, path: string): ProjectionRowInput {
  if (!isRecord(raw)) throw new Error(`${path} must be an object`);
  const { eventId, occurrenceKey, fireAt, title, body, eveType } = raw;
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
  if (eveType !== undefined && typeof eveType !== 'string') {
    throw new Error(`${path}.eveType, if present, must be a string`);
  }
  return {
    eventId,
    occurrenceKey,
    fireAt,
    title,
    body,
    ...(eveType !== undefined ? { eveType } : {}),
  };
}

/** `eveTypes` is optional so an older client's upload still parses (leaving the stored list alone). */
function parseEveTypes(raw: unknown, path: string): string[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) throw new Error(`${path}, if present, must be an array`);
  if (raw.length > MAX_EVE_TYPES) throw new Error(`${path} has more than ${MAX_EVE_TYPES} entries`);
  for (const type of raw) {
    if (typeof type !== 'string' || type.length === 0 || type.length > MAX_EVE_TYPE_LENGTH) {
      throw new Error(`${path} must contain only non-empty strings`);
    }
  }
  return [...new Set(raw as string[])].sort();
}

/** Avoided Systems, including pod-kill / EDENCOM / Triglavian ones; New Eden has ~8,500 gated systems. */
export const MAX_AVOIDED_SYSTEMS = 10_000;
const ROUTE_PREFERENCES = ['shortest', 'prefer-highsec', 'avoid-highsec'] as const;

/**
 * Lenient, unlike most of the registration: the rules only feed nearby alerts,
 * so a value that does not parse is dropped (the stored rules stay) instead of
 * refusing the whole upload with its Projection and types.
 */
function parseRouteRules(raw: unknown): NearbyRouteRules | undefined {
  if (!isPlainRecord(raw)) return undefined;
  const { preference, securityPenalty, avoid } = raw;
  if (!(ROUTE_PREFERENCES as readonly unknown[]).includes(preference)) return undefined;
  if (
    typeof securityPenalty !== 'number' ||
    !Number.isInteger(securityPenalty) ||
    securityPenalty < 0 ||
    securityPenalty > 100
  ) {
    return undefined;
  }
  if (!Array.isArray(avoid) || avoid.length > MAX_AVOIDED_SYSTEMS) return undefined;
  if (!avoid.every((id) => typeof id === 'number' && Number.isSafeInteger(id) && id > 0)) {
    return undefined;
  }
  return {
    preference: preference as NearbyRouteRules['preference'],
    securityPenalty,
    avoid: [...new Set(avoid as number[])].sort((a, b) => a - b),
  };
}

/**
 * A deviceId becomes a `deviceRegistrations` doc id and the prefix of every
 * projection row id (issue #2240), so it must be a safe Firestore id: no `/`,
 * no `.`/`..`, bounded length. The client's `crypto.randomUUID()` and its
 * base36 fallback (`src/sync/deviceId.ts`) both fit.
 */
const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/** Validate the callable's raw `request.data`. Throws a plain Error on any shape violation. */
export function parseRegisterDeviceInput(data: unknown): RegisterDeviceInput {
  if (!isRecord(data)) throw new Error('Request body must be an object');

  const { deviceId, fcmToken, characters, quietHours, routeRules } = data;
  if (typeof deviceId !== 'string' || deviceId.length === 0) {
    throw new Error('deviceId (non-empty string) is required');
  }
  if (!DEVICE_ID_PATTERN.test(deviceId)) {
    throw new Error('deviceId must be 1-128 characters of A-Z, a-z, 0-9, _ or -');
  }
  if (typeof fcmToken !== 'string' || fcmToken.length === 0) {
    throw new Error('fcmToken (non-empty string) is required');
  }
  if (!Array.isArray(characters) || characters.length === 0) {
    throw new Error('characters (non-empty array) is required');
  }

  const parsedCharacters = characters.map((entry, i) => {
    if (!isRecord(entry)) throw new Error(`characters[${i}] must be an object`);
    const { characterId, accessToken, projectionRows, eveTypes, serverEvents, serverInputs } =
      entry;
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
    const parsedServerEvents = parseServerEvents(serverEvents, `characters[${i}].serverEvents`);
    const parsedServerInputs = parseServerInputs(serverInputs, `characters[${i}].serverInputs`);
    return {
      characterId,
      accessToken,
      projectionRows: rows,
      eveTypes: parseEveTypes(eveTypes, `characters[${i}].eveTypes`),
      ...(parsedServerEvents !== undefined ? { serverEvents: parsedServerEvents } : {}),
      ...(parsedServerInputs !== undefined ? { serverInputs: parsedServerInputs } : {}),
    };
  });

  const parsedRouteRules = parseRouteRules(routeRules);
  return {
    deviceId,
    fcmToken,
    characters: parsedCharacters,
    ...(quietHours !== undefined ? { quietHours: parseQuietHours(quietHours) } : {}),
    ...(parsedRouteRules !== undefined ? { routeRules: parsedRouteRules } : {}),
  };
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
  const eveTypesByCharacter: Record<number, string[]> = {};
  const serverEventsByCharacter: Record<number, string[]> = {};
  const serverInputsByCharacter: Record<number, ServerEventInputs> = {};

  for (const character of input.characters) {
    try {
      const claims = await verifyEveAccessToken(character.accessToken, verifyOptions);
      if (claims.characterId !== character.characterId) {
        throw new Error('Access token verified to a different characterId than claimed');
      }
      characterIds.push(character.characterId);
      projections.push({ characterId: character.characterId, rows: character.projectionRows });
      if (character.eveTypes !== undefined) {
        eveTypesByCharacter[character.characterId] = character.eveTypes;
      }
      if (character.serverEvents !== undefined) {
        serverEventsByCharacter[character.characterId] = character.serverEvents;
      }
      if (character.serverInputs !== undefined) {
        serverInputsByCharacter[character.characterId] = character.serverInputs;
      }
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
    eveTypesByCharacter,
    serverEventsByCharacter,
    serverInputsByCharacter,
  };
}
