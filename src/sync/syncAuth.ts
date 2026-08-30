// Firebase auth bridge: authenticate to Firebase AS an EVE character.
//
// Model: one Firebase session per app instance, uid = char:{characterId}.
// Sync docs are per character, so the client signs in as the ACTIVE character
// and re-authenticates on character switch (ensureSignedIn is a no-op when the
// session already matches). Cross-device: the same character always maps to
// the same uid, so its docs converge across devices.
//
// The EVE refresh token never leaves the device: only the current short-lived
// access token is sent to the mintFirebaseToken callable, which verifies it
// against CCP's JWKS and returns a Firebase custom token carrying the
// character's ownerHash as a custom claim.

import { signInWithCustomToken, signOut } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { getValidAccessToken } from '@/auth/session';
import { getSyncAuth, getSyncFunctions } from './firebaseApp';
import { uidForCharacter } from './uid';

export { uidForCharacter };

interface MintResponse {
  token: string;
  uid: string;
  ownerHash: string;
}

let inflight: { characterId: number; promise: Promise<string> } | null = null;

/**
 * Ensure the Firebase session is signed in as this character; mint + sign in
 * when it isn't (first sync or character switch). Returns the Firebase uid.
 */
export async function ensureSignedIn(characterId: number): Promise<string> {
  const uid = uidForCharacter(characterId);
  const auth = getSyncAuth();
  if (auth.currentUser?.uid === uid) return uid;
  if (inflight?.characterId === characterId) return inflight.promise;

  const promise = (async () => {
    const accessToken = await getValidAccessToken(characterId);
    const mint = httpsCallable<{ accessToken: string }, MintResponse>(
      getSyncFunctions(),
      'mintFirebaseToken'
    );
    const result = await mint({ accessToken });
    const credential = await signInWithCustomToken(auth, result.data.token);
    if (credential.user.uid !== uid) {
      await signOut(auth);
      throw new Error(`Signed in as unexpected uid: ${credential.user.uid}`);
    }
    return uid;
  })();

  inflight = { characterId, promise };
  try {
    return await promise;
  } finally {
    if (inflight?.promise === promise) inflight = null;
  }
}
