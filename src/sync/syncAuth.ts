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

const inflight = new Map<number, Promise<string>>();

export async function removeCharacterSession(characterId: number): Promise<void> {
  inflight.delete(characterId);
  try {
    await signOut(getSyncAuth(characterId));
    const legacy = getLegacySyncAuth();
    await whenAuthRestored(legacy);
    if (legacy.currentUser?.uid === uidForCharacter(characterId)) await signOut(legacy);
  } finally {
    await disposeCharacterApp(characterId);
  }
}

export async function signOutOfSync(characterIds: readonly number[] = []): Promise<void> {
  const ids = new Set([...characterIds, ...startedCharacterIds()]);
  const results = await Promise.allSettled([
    ...[...ids].map((id) => removeCharacterSession(id)),
    signOut(getLegacySyncAuth()),
  ]);
  const failed = results.find((r) => r.status === 'rejected');
  if (failed) throw (failed as PromiseRejectedResult).reason;
}

const MINT_TIMEOUT_MS = 20_000;

async function whenAuthRestored(auth: Auth): Promise<void> {
  if (typeof auth.authStateReady === 'function') await auth.authStateReady();
}

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

export async function confirmOwnership(characterId: number, ownerHash: string): Promise<boolean> {
  const auth = getSyncAuth(characterId);
  await whenAuthRestored(auth);
  try {
    return (await mintAndSignIn(auth, characterId, uidForCharacter(characterId))) === ownerHash;
  } catch {
    return false;
  }
}

export function ensureAnySession(characterId: number): Promise<string> {
  return ensureSignedIn(characterId);
}
