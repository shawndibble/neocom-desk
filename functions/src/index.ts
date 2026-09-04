// mintFirebaseToken: exchange a verified EVE access token for a Firebase
// custom token. The EVE *refresh* token never reaches this backend (ADR 0001);
// the client sends only its short-lived access token, which is verified
// against EVE's published JWKS before any Firebase credential is minted.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { error as logError } from 'firebase-functions/logger';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import {
  verifyEveAccessToken,
  verifyOptionsFromEnv,
  uidForCharacter,
  type EveTokenClaims,
} from './verifyEveToken.js';
import { buildDeviceRegistration, parseRegisterDeviceInput } from './registerDevice.js';

initializeApp();

// Built at cold start so a missing EVE_CLIENT_ID fails deployment/startup
// loudly instead of silently accepting any EVE app's tokens per request.
const verifyOptions = verifyOptionsFromEnv();

export const mintFirebaseToken = onCall<{ accessToken?: unknown }>(
  // Hobby-scale abuse cap; also bounds the JWKS fetch fan-out.
  { maxInstances: 5 },
  async (request) => {
    const accessToken = request.data?.accessToken;
    if (typeof accessToken !== 'string' || accessToken.length === 0) {
      throw new HttpsError('invalid-argument', 'accessToken (string) is required');
    }

    let claims: EveTokenClaims;
    try {
      claims = await verifyEveAccessToken(accessToken, verifyOptions);
    } catch (err) {
      // Client response stays opaque (don't leak which validation step
      // failed), but the real cause still needs to be diagnosable from Cloud
      // Logging — the previous bare `catch {}` discarded it entirely.
      logError('EVE access token rejected', { error: err instanceof Error ? err.message : err });
      throw new HttpsError('unauthenticated', 'EVE access token rejected');
    }

    const uid = uidForCharacter(claims.characterId);
    // ownerHash rides along as a custom claim; Firestore rules compare it to the
    // ownerHash field on each doc so a transferred character can't read the
    // previous owner's data.
    const token = await getAuth().createCustomToken(uid, { ownerHash: claims.ownerHash });
    return { token, uid, ownerHash: claims.ownerHash };
  }
);

// registerDevice: register one device's FCM token against every Character it
// holds, in one call — see registerDevice.ts and issue #356. Firestore rules
// deny all client access to `deviceRegistrations`; this admin write is the
// only path in. The doc is a wholesale `set` keyed by the device's own
// (client-generated, device-local) id, never a token-keyed doc — that is what
// makes re-registering after an FCM token rotation replace the entry instead
// of accumulating one per token.
export const registerDevice = onCall<unknown>({ maxInstances: 5 }, async (request) => {
  let input;
  try {
    input = parseRegisterDeviceInput(request.data);
  } catch (err) {
    throw new HttpsError(
      'invalid-argument',
      err instanceof Error ? err.message : 'Invalid request body'
    );
  }

  const { registration, rejected } = await buildDeviceRegistration(input, verifyOptions, logError);

  if (registration.characterIds.length === 0) {
    throw new HttpsError('unauthenticated', 'No character access token could be verified');
  }

  await getFirestore().collection('deviceRegistrations').doc(input.deviceId).set({
    fcmToken: registration.fcmToken,
    characterIds: registration.characterIds,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { deviceId: input.deviceId, registered: registration.characterIds, rejected };
});
