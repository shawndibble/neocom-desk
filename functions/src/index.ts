// mintFirebaseToken: exchange a verified EVE access token for a Firebase
// custom token. The EVE *refresh* token never reaches this backend (ADR 0001);
// the client sends only its short-lived access token, which is verified
// against EVE's published JWKS before any Firebase credential is minted.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import {
  verifyEveAccessToken,
  verifyOptionsFromEnv,
  uidForCharacter,
  type EveTokenClaims,
} from './verifyEveToken.js';

initializeApp();

export const mintFirebaseToken = onCall<{ accessToken?: unknown }>(async (request) => {
  const accessToken = request.data?.accessToken;
  if (typeof accessToken !== 'string' || accessToken.length === 0) {
    throw new HttpsError('invalid-argument', 'accessToken (string) is required');
  }

  let claims: EveTokenClaims;
  try {
    claims = await verifyEveAccessToken(accessToken, verifyOptionsFromEnv());
  } catch {
    // Deliberately opaque: don't leak which validation step failed.
    throw new HttpsError('unauthenticated', 'EVE access token rejected');
  }

  const uid = uidForCharacter(claims.characterId);
  // ownerHash rides along as a custom claim; Firestore rules compare it to the
  // ownerHash field on each doc so a transferred character can't read the
  // previous owner's data.
  const token = await getAuth().createCustomToken(uid, { ownerHash: claims.ownerHash });
  return { token, uid, ownerHash: claims.ownerHash };
});
