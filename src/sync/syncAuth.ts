// Firebase auth bridge: authenticate to Firebase AS an EVE character.
//
// Model: one Firebase session per app instance, uid = char:{characterId}.
// Sync docs are per character, so the client signs in as the ACTIVE character
// and re-authenticates on character switch (ensureSignedIn is a no-op when the
// session already matches). Reads that only need *a* session (the public
// snapshots) use ensureAnySession instead, so they never swap it mid-sync.
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
import { getSyncAuth, getSyncFunctions } from './firebaseApp';
import { uidForCharacter } from './uid';

export { uidForCharacter };

interface MintResponse {
  token: string;
  uid: string;
  ownerHash: string;
}

/**
 * Sign-ins for *different* Characters must not overlap: Firebase has one
 * session slot, and whichever `signInWithCustomToken` lands last owns it, so
 * two overlapping sign-ins can each resolve while the other Character holds
 * the session (issue #2262). Every sign-in runs through this chain, one at a
 * time; `inflight` coalesces repeat requests for the same Character.
 */
const inflight = new Map<number, Promise<string>>();
let signInChain: Promise<unknown> = Promise.resolve();

function runSerialized<T>(task: () => Promise<T>): Promise<T> {
  const run = signInChain.then(task, task);
  signInChain = run.catch(() => undefined);
  return run;
}

/**
 * Drop the Firebase session. It persists across reloads (IndexedDB), so without
 * this the last Character's credential would outlive a "log out of this
 * device". Sync docs are untouched: this is the local session only.
 */
export async function signOutOfSync(): Promise<void> {
  inflight.clear();
  await signOut(getSyncAuth());
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
 * Ensure the Firebase session is signed in as this character; mint + sign in
 * when it isn't (first sync or character switch). Returns the Firebase uid.
 *
 * Resolves only while the session is actually this Character's: the check is
 * on `auth.currentUser`, not the returned credential, since a sign-in that
 * something else overtook still hands back its own credential. An overtaken
 * sign-in retries once, then throws.
 */
export async function ensureSignedIn(characterId: number): Promise<string> {
  const uid = uidForCharacter(characterId);
  const auth = getSyncAuth();
  await whenAuthRestored(auth);
  if (auth.currentUser?.uid === uid) return uid;
  const existing = inflight.get(characterId);
  if (existing) return existing;

  const promise = runSerialized(async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      // A sign-in queued ahead of this one may already have been this Character.
      if (auth.currentUser?.uid === uid) return uid;
      await mintAndSignIn(auth, characterId, uid);
      if (auth.currentUser?.uid === uid) return uid;
    }
    throw new Error(
      `Firebase session was taken over by ${auth.currentUser?.uid ?? 'nobody'} while signing in as ${uid}`
    );
  });

  inflight.set(characterId, promise);
  try {
    return await promise;
  } finally {
    if (inflight.get(characterId) === promise) inflight.delete(characterId);
  }
}

/**
 * Ensure *some* Character is signed in, for reads whose rule is only
 * `request.auth != null` (the public snapshots). Reuses the current session
 * whoever owns it, waits out a sign-in already in progress, and signs in as
 * `fallbackCharacterId` only when neither leaves a session. It never replaces
 * an existing session, so it cannot swap one out from under a Character's
 * sync pass (issue #2262). Returns the uid it ends up signed in as.
 */
export async function ensureAnySession(fallbackCharacterId: number): Promise<string> {
  const auth = getSyncAuth();
  await whenAuthRestored(auth);
  // Read through a call each time: the session can land while this waits.
  const currentUid = (): string | undefined => auth.currentUser?.uid;
  const existing = currentUid();
  if (existing) return existing;

  // Decide inside the chain, not before it: a sign-in queued ahead of this one
  // (an alt's sync) may land while this waits, and must not then be replaced.
  return runSerialized(async () => {
    const landed = currentUid();
    if (landed) return landed;
    const uid = uidForCharacter(fallbackCharacterId);
    await mintAndSignIn(auth, fallbackCharacterId, uid);
    const after = currentUid();
    if (after !== uid) {
      throw new Error(
        `Firebase session was taken over by ${after ?? 'nobody'} while signing in as ${uid}`
      );
    }
    return uid;
  });
}
