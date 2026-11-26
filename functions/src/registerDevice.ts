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
  projectionRows: ProjectionRowInput[];
  eveTypes?: string[];
  serverEvents?: string[];
  serverInputs?: ServerEventInputs;
}

export const MAX_EVE_TYPES = 200;
const MAX_EVE_TYPE_LENGTH = 100;

export interface RegisterDeviceInput {
  deviceId: string;
  fcmToken: string;
  characters: DeviceCharacterInput[];
  quietHours?: QuietHours | null;
  routeRules?: NearbyRouteRules;
}

export interface DeviceRegistrationDoc {
  fcmToken: string;
  characterIds: number[];
}

export interface CharacterProjection {
  characterId: number;
  rows: ProjectionRowInput[];
}

export interface RegisterDeviceResult {
  registration: DeviceRegistrationDoc;
  rejected: number[];
  projections: CharacterProjection[];
  eveTypesByCharacter: Record<number, string[]>;
  serverEventsByCharacter: Record<number, string[]>;
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

export const MAX_AVOIDED_SYSTEMS = 10_000;
const ROUTE_PREFERENCES = ['shortest', 'prefer-highsec', 'avoid-highsec'] as const;

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

const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

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
