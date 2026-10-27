import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signInWithCustomToken, signOut } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { getValidAccessToken } from '@/auth/session';
import {
  confirmOwnership,
  ensureAnySession,
  ensureSignedIn,
  removeCharacterSession,
  signOutOfSync,
  uidForCharacter,
} from './syncAuth';
import { deferred } from '@/test/deferred';

vi.mock('firebase/auth', () => ({
  signInWithCustomToken: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(),
}));
vi.mock('@/auth/session', () => ({
  getValidAccessToken: vi.fn(),
}));

interface FakeAuth {
  id: number;
  currentUser: {
    uid: string;
    getIdToken?: () => Promise<string>;
    getIdTokenResult?: () => Promise<{ claims: Record<string, unknown> }>;
  } | null;
  authStateReady?: () => Promise<void>;
}
/** One Auth per Character, like the named apps in `firebaseApp.ts`. */
const auths = new Map<number, FakeAuth>();
const fakeAuthFor = (id: number): FakeAuth => {
  let auth = auths.get(id);
  if (!auth) {
    auth = { id, currentUser: null };
    auths.set(id, auth);
  }
  return auth;
};
const legacyAuth = { id: 0, currentUser: null as { uid: string } | null };
const started = vi.hoisted(() => ({ ids: [] as number[] }));
const disposeCharacterApp = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('./firebaseApp', () => ({
  getSyncAuth: (id: number) => fakeAuthFor(id),
  getLegacySyncAuth: () => legacyAuth,
  getSyncFunctions: () => ({}),
  disposeCharacterApp,
}));
vi.mock('./firebaseCore', () => ({ startedCharacterIds: () => started.ids }));

const mint = vi.fn();

/** Mint returns `token-<id>`; signing in with it makes that Auth `char:<id>`. */
function mintPerCharacter() {
  vi.mocked(getValidAccessToken).mockImplementation(async (id) => `access-${id}`);
  mint.mockImplementation(async ({ accessToken }: { accessToken: string }) => {
    const id = accessToken.replace('access-', '');
    return { data: { token: `token-${id}`, uid: `char:${id}`, ownerHash: 'h' } };
  });
  vi.mocked(signInWithCustomToken).mockImplementation(async (auth, token) => {
    const user = { uid: token.replace('token-', 'char:') };
    (auth as unknown as FakeAuth).currentUser = user;
    return { user } as never;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  auths.clear();
  started.ids = [];
  vi.mocked(httpsCallable).mockReturnValue(mint as never);
  mintPerCharacter();
});

describe('uidForCharacter', () => {
  it('matches the uid minted by the Cloud Function', () => {
    expect(uidForCharacter(94832766)).toBe('char:94832766');
  });
});

describe('ensureSignedIn', () => {
  it('mints via the callable using the current EVE access token and signs in', async () => {
    const uid = await ensureSignedIn(1);
    expect(uid).toBe('char:1');
    expect(getValidAccessToken).toHaveBeenCalledWith(1);
    expect(mint).toHaveBeenCalledWith({ accessToken: 'access-1' });
    expect(signInWithCustomToken).toHaveBeenCalledWith(fakeAuthFor(1), 'token-1');
  });

  it('bounds the mint callable', async () => {
    await ensureSignedIn(1);
    expect(httpsCallable).toHaveBeenCalledWith({}, 'mintFirebaseToken', { timeout: 20_000 });
  });

  it('is a no-op when this character already has a session', async () => {
    fakeAuthFor(1).currentUser = { uid: 'char:1' };
    await ensureSignedIn(1);
    expect(mint).not.toHaveBeenCalled();
    expect(signInWithCustomToken).not.toHaveBeenCalled();
  });

  it('skips the mint when the restored session is this character', async () => {
    const auth = fakeAuthFor(1);
    auth.authStateReady = async () => {
      auth.currentUser = { uid: 'char:1' };
    };
    await expect(ensureSignedIn(1)).resolves.toBe('char:1');
    expect(mint).not.toHaveBeenCalled();
  });

  it('mints again when the session can no longer refresh', async () => {
    fakeAuthFor(1).currentUser = {
      uid: 'char:1',
      getIdToken: async () => {
        throw new Error('token expired');
      },
    };
    await expect(ensureSignedIn(1)).resolves.toBe('char:1');
    expect(mint).toHaveBeenCalledTimes(1);
  });

  it('keeps the session when its token refreshes', async () => {
    const getIdToken = vi.fn(async () => 'fresh');
    fakeAuthFor(1).currentUser = { uid: 'char:1', getIdToken };
    await ensureSignedIn(1);
    expect(getIdToken).toHaveBeenCalled();
    expect(mint).not.toHaveBeenCalled();
  });

  it('mints again when the session carries a previous ownerHash', async () => {
    // Developer claims survive every ID-token refresh, so a session minted
    // before a transfer would fail every hash-guarded write for good.
    fakeAuthFor(1).currentUser = {
      uid: 'char:1',
      getIdTokenResult: async () => ({ claims: { ownerHash: 'old' } }),
    };
    await expect(ensureSignedIn(1, 'h')).resolves.toBe('char:1');
    expect(mint).toHaveBeenCalledTimes(1);
  });

  it('refuses a minted session under another ownerHash than the caller read', async () => {
    await expect(ensureSignedIn(1, 'stale')).rejects.toThrow(/changed owner/);
  });

  it('keeps a session whose ownerHash claim is current', async () => {
    fakeAuthFor(1).currentUser = {
      uid: 'char:1',
      getIdTokenResult: async () => ({ claims: { ownerHash: 'h' } }),
    };
    await ensureSignedIn(1, 'h');
    expect(mint).not.toHaveBeenCalled();
  });

  it('coalesces concurrent sign-ins for the same character', async () => {
    const [a, b] = await Promise.all([ensureSignedIn(1), ensureSignedIn(1)]);
    expect([a, b]).toEqual(['char:1', 'char:1']);
    expect(mint).toHaveBeenCalledTimes(1);
  });

  it('signs out and throws when the minted uid does not match the character', async () => {
    mint.mockResolvedValue({ data: { token: 'token-999', uid: 'char:999', ownerHash: 'h' } });
    await expect(ensureSignedIn(1)).rejects.toThrow(/unexpected uid/);
    expect(signOut).toHaveBeenCalledWith(fakeAuthFor(1));
  });
});

describe('one session per character', () => {
  it('a sweep over 4 characters with valid persisted sessions mints nothing', async () => {
    for (const id of [1, 2, 3, 4]) fakeAuthFor(id).currentUser = { uid: `char:${id}` };
    for (const id of [1, 2, 3, 4]) await ensureSignedIn(id);
    await ensureSignedIn(1);
    expect(mint).not.toHaveBeenCalled();
    expect(signInWithCustomToken).not.toHaveBeenCalled();
  });

  it('signing in as another character leaves the first one signed in', async () => {
    await ensureSignedIn(1);
    await ensureSignedIn(2);
    expect(fakeAuthFor(1).currentUser?.uid).toBe('char:1');
    expect(fakeAuthFor(2).currentUser?.uid).toBe('char:2');
    // Back to the first: still no second mint for it.
    await ensureSignedIn(1);
    expect(mint).toHaveBeenCalledTimes(2);
  });

  it('two tabs syncing different characters never invalidate each other', async () => {
    // Each tab's own app instance restores its character's persisted session.
    const tabA = fakeAuthFor(1);
    const tabB = fakeAuthFor(2);
    tabA.currentUser = { uid: 'char:1' };
    tabB.currentUser = { uid: 'char:2' };
    await Promise.all([ensureSignedIn(1), ensureSignedIn(2)]);
    expect(tabA.currentUser?.uid).toBe('char:1');
    expect(tabB.currentUser?.uid).toBe('char:2');
    expect(mint).not.toHaveBeenCalled();
  });

  it('sign-ins for different characters run side by side', async () => {
    const gate = deferred<void>();
    vi.mocked(signInWithCustomToken).mockImplementation(async (auth, token) => {
      if (token === 'token-1') await gate.promise;
      const user = { uid: token.replace('token-', 'char:') };
      (auth as unknown as FakeAuth).currentUser = user;
      return { user } as never;
    });
    const slow = ensureSignedIn(1);
    await expect(ensureSignedIn(2)).resolves.toBe('char:2');
    gate.resolve();
    await expect(slow).resolves.toBe('char:1');
  });
});

describe('ensureAnySession', () => {
  it('is that character’s own session', async () => {
    await expect(ensureAnySession(1)).resolves.toBe('char:1');
    expect(fakeAuthFor(1).currentUser?.uid).toBe('char:1');
  });
});

describe('removing sessions', () => {
  afterEach(() => {
    started.ids = [];
  });

  it('removeCharacterSession signs out and deletes that character’s app', async () => {
    await ensureSignedIn(1);
    await removeCharacterSession(1);
    expect(signOut).toHaveBeenCalledWith(fakeAuthFor(1));
    expect(disposeCharacterApp).toHaveBeenCalledWith(1);
  });

  it('also signs out a pre-#5074 default-app session of that character', async () => {
    legacyAuth.currentUser = { uid: 'char:1' };
    await removeCharacterSession(1);
    expect(signOut).toHaveBeenCalledWith(legacyAuth);
    legacyAuth.currentUser = null;
  });

  it('leaves a legacy session of another character alone', async () => {
    legacyAuth.currentUser = { uid: 'char:2' };
    await removeCharacterSession(1);
    expect(signOut).not.toHaveBeenCalledWith(legacyAuth);
    legacyAuth.currentUser = null;
  });

  it('still deletes the app when the sign-out fails', async () => {
    vi.mocked(signOut).mockRejectedValueOnce(new Error('offline'));
    await expect(removeCharacterSession(1)).rejects.toThrow('offline');
    expect(disposeCharacterApp).toHaveBeenCalledWith(1);
  });

  it('signOutOfSync clears named ids, started apps and the legacy session', async () => {
    started.ids = [3];
    await signOutOfSync([1, 2]);
    expect(
      (disposeCharacterApp.mock.calls as unknown as number[][]).map((c) => c[0]).sort()
    ).toEqual([1, 2, 3]);
    expect(signOut).toHaveBeenCalledWith(legacyAuth);
  });
});

describe('confirmOwnership', () => {
  it('mints afresh even over a live session, and confirms a matching ownerHash', async () => {
    fakeAuthFor(1).currentUser = { uid: 'char:1' };
    await expect(confirmOwnership(1, 'h')).resolves.toBe(true);
    expect(mint).toHaveBeenCalledTimes(1);
  });

  it('refuses another ownerHash, and a mint that fails (revoked EVE grant)', async () => {
    await expect(confirmOwnership(1, 'other')).resolves.toBe(false);
    vi.mocked(getValidAccessToken).mockRejectedValue(new Error('invalid_grant'));
    await expect(confirmOwnership(1, 'h')).resolves.toBe(false);
  });
});
