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
import { NEARBY_EVENT_IDS, type NearbyEventId, type NearbyRouteRules } from './nearbyAlerts.js';

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
   * The Notification Event ids this device enabled for the browser channel
   * for this Character among the ones the server pushes itself (issues #5121,
   * #5122), sorted and de-duplicated. Replaces this device's own previous
   * list; absent (an older client) leaves it untouched.
   */
  serverEvents?: string[];
  /**
   * This device's N for each nearby event for this Character (issue #5122):
   * how many jumps from the Current System counts as nearby. Absent leaves
   * the stored value untouched.
   */
  nearbyJumps?: Partial<Record<NearbyEventId, number>>;
}

/** Bounds a hostile or buggy client's `eveTypes` upload; the real list is a few dozen. */
export const MAX_EVE_TYPES = 200;
const MAX_EVE_TYPE_LENGTH = 100;
const MAX_SERVER_EVENTS = 100;
const MAX_EVENT_ID_LENGTH = 64;
/** The app's options top out at 20; anything sane fits. */
const MAX_NEARBY_JUMPS = 100;
/** Avoided Systems, including pod-kill / EDENCOM / Triglavian ones; New Eden has ~8,500 gated systems. */
export const MAX_AVOIDED_SYSTEMS = 10_000;
const ROUTE_PREFERENCES = ['shortest', 'prefer-highsec', 'avoid-highsec'] as const;

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
   * under them (issue #5122). Absent (an older client) leaves the stored rules
   * untouched.
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
  /** Each verified character's nearby N per event; absent when the client sent none. */
  nearbyJumpsByCharacter: Record<number, Partial<Record<NearbyEventId, number>>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
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

function parseServerEvents(raw: unknown, path: string): string[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) throw new Error(`${path}, if present, must be an array`);
  if (raw.length > MAX_SERVER_EVENTS) {
    throw new Error(`${path} has more than ${MAX_SERVER_EVENTS} entries`);
  }
  for (const id of raw) {
    if (typeof id !== 'string' || id.length === 0 || id.length > MAX_EVENT_ID_LENGTH) {
      throw new Error(`${path} must contain only non-empty strings`);
    }
  }
  return [...new Set(raw as string[])].sort();
}

const isWholeIn = (value: unknown, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max;

/** Only the nearby events' keys are kept: a later client's extra key is ignored, not an error. */
function parseNearbyJumps(
  raw: unknown,
  path: string
): Partial<Record<NearbyEventId, number>> | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw) || Array.isArray(raw))
    throw new Error(`${path}, if present, must be an object`);
  const jumps: Partial<Record<NearbyEventId, number>> = {};
  for (const eventId of NEARBY_EVENT_IDS) {
    const value = raw[eventId];
    if (value === undefined) continue;
    if (!isWholeIn(value, MAX_NEARBY_JUMPS)) {
      throw new Error(`${path}.${eventId} must be a whole number from 0 to ${MAX_NEARBY_JUMPS}`);
    }
    jumps[eventId] = value;
  }
  return jumps;
}

function parseRouteRules(raw: unknown): NearbyRouteRules | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw) || Array.isArray(raw))
    throw new Error('routeRules, if present, must be an object');
  const { preference, securityPenalty, avoid } = raw;
  if (!(ROUTE_PREFERENCES as readonly unknown[]).includes(preference)) {
    throw new Error(`routeRules.preference must be one of ${ROUTE_PREFERENCES.join(', ')}`);
  }
  if (!isWholeIn(securityPenalty, 100)) {
    throw new Error('routeRules.securityPenalty must be a whole number from 0 to 100');
  }
  if (!Array.isArray(avoid) || avoid.length > MAX_AVOIDED_SYSTEMS) {
    throw new Error(`routeRules.avoid must be an array of at most ${MAX_AVOIDED_SYSTEMS} ids`);
  }
  if (!avoid.every((id) => typeof id === 'number' && Number.isSafeInteger(id) && id > 0)) {
    throw new Error('routeRules.avoid must contain only system ids');
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
    const { characterId, accessToken, projectionRows, eveTypes, serverEvents, nearbyJumps } = entry;
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
    return {
      characterId,
      accessToken,
      projectionRows: rows,
      eveTypes: parseEveTypes(eveTypes, `characters[${i}].eveTypes`),
      serverEvents: parseServerEvents(serverEvents, `characters[${i}].serverEvents`),
      nearbyJumps: parseNearbyJumps(nearbyJumps, `characters[${i}].nearbyJumps`),
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
  const nearbyJumpsByCharacter: Record<number, Partial<Record<NearbyEventId, number>>> = {};

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
      if (character.nearbyJumps !== undefined) {
        nearbyJumpsByCharacter[character.characterId] = character.nearbyJumps;
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
    nearbyJumpsByCharacter,
  };
}
