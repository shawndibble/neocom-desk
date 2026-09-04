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

export interface DeviceCharacterInput {
  characterId: number;
  accessToken: string;
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

export interface RegisterDeviceResult {
  registration: DeviceRegistrationDoc;
  /** characterIds whose access token did not verify (or verified to a different character). */
  rejected: number[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
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
    const { characterId, accessToken } = entry;
    if (typeof characterId !== 'number' || !Number.isFinite(characterId)) {
      throw new Error(`characters[${i}].characterId must be a number`);
    }
    if (typeof accessToken !== 'string' || accessToken.length === 0) {
      throw new Error(`characters[${i}].accessToken (non-empty string) is required`);
    }
    return { characterId, accessToken };
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

  for (const character of input.characters) {
    try {
      const claims = await verifyEveAccessToken(character.accessToken, verifyOptions);
      if (claims.characterId !== character.characterId) {
        throw new Error('Access token verified to a different characterId than claimed');
      }
      characterIds.push(character.characterId);
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
  };
}
