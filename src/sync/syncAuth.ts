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
 * Bound on the mint callable. Sign-ins run one at a time, so the callable's own
 * 70 s default (per attempt, twice over) would stall every queued sign-in
 * behind one slow mint. Deliberately not a timeout around the whole queued
 * task: that would free the queue while an abandoned `signInWithCustomToken`
 * could still land and swap the session.
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

async function mintAndSignIn(auth: Auth, characterId: number, uid: string): Promise<void> {
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
}

/**
 * Whether the restored session is still good: a cached ID token is returned
 * as is, an expired one is refreshed over the network, and a session that can
 * no longer refresh (disabled user, revoked) throws.
 */
async function sessionUsable(auth: Auth, uid: string): Promise<boolean> {
  const user = auth.currentUser;
  if (user?.uid !== uid) return false;
  if (typeof user.getIdToken !== 'function') return true;
  try {
    await user.getIdToken();
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure this character's own Firebase session exists; mint + sign in only
 * when it is missing or cannot refresh. Returns the Firebase uid.
 */
export async function ensureSignedIn(characterId: number): Promise<string> {
  const uid = uidForCharacter(characterId);
  const auth = getSyncAuth(characterId);
  await whenAuthRestored(auth);
  if (await sessionUsable(auth, uid)) return uid;
  const existing = inflight.get(characterId);
  if (existing) return existing;

  const promise = (async () => {
    if (await sessionUsable(auth, uid)) return uid;
    await mintAndSignIn(auth, characterId, uid);
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
 * Ensure *some* session for reads whose rule is only `request.auth != null`
 * (the lawless systems list, share links). Now each character has its own
 * session, so this is that character's own.
 */
export function ensureAnySession(characterId: number): Promise<string> {
  return ensureSignedIn(characterId);
}
