// Firebase auth bridge: authenticate to Firebase AS an EVE character.
//
// Model: one persisted Firebase session per character (issue #5074), each in
// its own named Firebase app (`sync/firebaseApp.ts`), uid = char:{characterId}.
// Nothing switches a shared session any more: a character mints a custom token
// only when its own session is missing or can no longer refresh, so a sweep
// over characters with live sessions mints nothing.
// Cross-device: the same character always maps to the same uid, so its docs
// converge across devices.
//
// The EVE refresh token never leaves the device: only the current short-lived
// access token is sent to the mintFirebaseToken callable, which verifies it
// against CCP's JWKS and returns a Firebase custom token carrying the
// character's ownerHash as a custom claim.

import { signInWithCustomToken, signOut, type Auth } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { getValidAccessToken } from '@/auth/session';
import {
  disposeCharacterApp,
  getLegacySyncAuth,
  getSyncAuth,
  getSyncFunctions,
} from './firebaseApp';
import { startedCharacterIds } from './firebaseCore';
import { uidForCharacter } from './uid';

export { uidForCharacter };

interface MintResponse {
  token: string;
  uid: string;
  ownerHash: string;
}

/** Coalesces repeat requests for the same Character's sign-in. */
const inflight = new Map<number, Promise<string>>();

/**
 * Remove a Character's Firebase session and app from this device. The session
 * persists across reloads (IndexedDB), so without this a removed Character's
 * credential would outlive it. Sync docs are untouched: local session only.
 */
export async function removeCharacterSession(characterId: number): Promise<void> {
  inflight.delete(characterId);
  try {
    await signOut(getSyncAuth(characterId));
    // A session saved before #5074 lives in the default app.
    const legacy = getLegacySyncAuth();
    await whenAuthRestored(legacy);
    if (legacy.currentUser?.uid === uidForCharacter(characterId)) await signOut(legacy);
  } finally {
    await disposeCharacterApp(characterId);
  }
}

/**
 * Drop every Character's Firebase session, for "log out of this device".
 * `characterIds` names the ones that may hold a persisted session from an
 * earlier page load, whose app has not started yet.
 */
export async function signOutOfSync(characterIds: readonly number[] = []): Promise<void> {
  const ids = new Set([...characterIds, ...startedCharacterIds()]);
  const results = await Promise.allSettled([
    ...[...ids].map((id) => removeCharacterSession(id)),
    signOut(getLegacySyncAuth()),
  ]);
  const failed = results.find((r) => r.status === 'rejected');
  if (failed) throw (failed as PromiseRejectedResult).reason;
}

/**
 * Bound on the mint callable: its own 70 s default (per attempt, twice over)
 * would leave a caller waiting on one slow mint.
 */
const MINT_TIMEOUT_MS = 20_000;

/**
 * Wait for Firebase to restore the persisted session (IndexedDB) before
 * reading `currentUser`, which is null until then. Without this, a call made
 * at boot would mint and replace a session that was about to be restored.
 */
async function whenAuthRestored(auth: Auth): Promise<void> {
  // Test doubles of `Auth` may not implement it.
  if (typeof auth.authStateReady === 'function') await auth.authStateReady();
}

/** Mint + sign in; resolves with the ownerHash the new session carries. */
async function mintAndSignIn(auth: Auth, characterId: number, uid: string): Promise<string> {
  const accessToken = await getValidAccessToken(characterId);
  const mint = httpsCallable<{ accessToken: string }, MintResponse>(
    getSyncFunctions(),
    'mintFirebaseToken',
    { timeout: MINT_TIMEOUT_MS }
  );
  const result = await mint({ accessToken });
  const credential = await signInWithCustomToken(auth, result.data.token);
  if (credential.user.uid !== uid) {
    await signOut(auth);
    throw new Error(`Signed in as unexpected uid: ${credential.user.uid}`);
  }
  return result.data.ownerHash;
}

/**
 * Whether the restored session is still good: a cached ID token is returned
 * as is, an expired one is refreshed over the network, and a session that can
 * no longer refresh (disabled user, revoked) throws.
 *
 * With `ownerHash`, the token's ownerHash claim must also be that one. Custom
 * claims survive every ID-token refresh, so a session persisted before the
 * Character changed owner keeps the old claim, and the rules refuse every
 * hash-guarded write (`incomingHashMatches`) until it is minted again.
 */
async function sessionUsable(auth: Auth, uid: string, ownerHash?: string): Promise<boolean> {
  const user = auth.currentUser;
  if (user?.uid !== uid) return false;
  try {
    if (ownerHash !== undefined && typeof user.getIdTokenResult === 'function') {
      const { claims } = await user.getIdTokenResult();
      return claims.ownerHash === ownerHash;
    }
    if (typeof user.getIdToken === 'function') await user.getIdToken();
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure this character's own Firebase session exists; mint + sign in only
 * when it is missing, cannot refresh, or (given `ownerHash`) carries another
 * owner's claim. Returns the Firebase uid.
 */
export async function ensureSignedIn(characterId: number, ownerHash?: string): Promise<string> {
  const uid = uidForCharacter(characterId);
  const auth = getSyncAuth(characterId);
  await whenAuthRestored(auth);
  if (await sessionUsable(auth, uid, ownerHash)) return uid;
  const existing = inflight.get(characterId);
  if (existing) return existing;

  const promise = (async () => {
    if (await sessionUsable(auth, uid, ownerHash)) return uid;
    const minted = await mintAndSignIn(auth, characterId, uid);
    // The mint's EVE token refresh can rewrite the Character's ownerHash after
    // the caller read it; writing under the old one would be refused everywhere.
    if (ownerHash !== undefined && minted !== ownerHash) {
      throw new Error('Character changed owner during sign-in');
    }
    return uid;
  })();
  inflight.set(characterId, promise);
  try {
    return await promise;
  } finally {
    if (inflight.get(characterId) === promise) inflight.delete(characterId);
  }
}

/**
 * Prove this device still holds the Character under `ownerHash`: a fresh mint
 * needs a live EVE token, which CCP revokes on transfer, while a persisted
 * Firebase session outlives it. Gates `setOwnedDoc` deleting a doc it cannot
 * read, so a previous owner's device can never clear the new owner's.
 */
export async function confirmOwnership(characterId: number, ownerHash: string): Promise<boolean> {
  const auth = getSyncAuth(characterId);
  await whenAuthRestored(auth);
  try {
    return (await mintAndSignIn(auth, characterId, uidForCharacter(characterId))) === ownerHash;
  } catch {
    return false;
  }
}

/**
 * Ensure *some* session for reads whose rule is only `request.auth != null`
 * (the lawless systems list, share links). Now each character has its own
 * session, so this is that character's own.
 */
export function ensureAnySession(characterId: number): Promise<string> {
  return ensureSignedIn(characterId);
}
