import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signInWithCustomToken, signOut } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { getValidAccessToken } from '@/auth/session';
import { ensureAnySession, ensureSignedIn, signOutOfSync, uidForCharacter } from './syncAuth';

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

const fakeAuth = { currentUser: null as { uid: string } | null };
vi.mock('./firebaseApp', () => ({
  getSyncAuth: () => fakeAuth,
  getSyncFunctions: () => ({}),
}));

const mint = vi.fn();

beforeEach(async () => {
  vi.clearAllMocks();
  fakeAuth.currentUser = null;
  vi.mocked(httpsCallable).mockReturnValue(mint as never);
  vi.mocked(getValidAccessToken).mockResolvedValue('eve-access-token');
  mint.mockResolvedValue({ data: { token: 'custom-token', uid: 'char:1', ownerHash: 'h' } });
  vi.mocked(signInWithCustomToken).mockImplementation(async (_auth, token) => {
    const user = { uid: token === 'custom-token' ? 'char:1' : 'char:999' };
    fakeAuth.currentUser = user;
    return { user } as never;
  });
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
    expect(mint).toHaveBeenCalledWith({ accessToken: 'eve-access-token' });
    expect(signInWithCustomToken).toHaveBeenCalledWith(fakeAuth, 'custom-token');
  });

  it('is a no-op when already signed in as this character', async () => {
    fakeAuth.currentUser = { uid: 'char:1' };
    await ensureSignedIn(1);
    expect(mint).not.toHaveBeenCalled();
    expect(signInWithCustomToken).not.toHaveBeenCalled();
  });

  it('re-authenticates on character switch', async () => {
    fakeAuth.currentUser = { uid: 'char:1' };
    mint.mockResolvedValue({ data: { token: 'other-token', uid: 'char:2', ownerHash: 'h' } });
    vi.mocked(signInWithCustomToken).mockImplementation(async () => {
      const user = { uid: 'char:2' };
      fakeAuth.currentUser = user;
      return { user } as never;
    });
    const uid = await ensureSignedIn(2);
    expect(uid).toBe('char:2');
    expect(mint).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent sign-ins for the same character', async () => {
    const [a, b] = await Promise.all([ensureSignedIn(1), ensureSignedIn(1)]);
    expect(a).toBe('char:1');
    expect(b).toBe('char:1');
    expect(mint).toHaveBeenCalledTimes(1);
  });

  it('signs out and throws when the minted uid does not match the character', async () => {
    mint.mockResolvedValue({ data: { token: 'wrong-token', uid: 'char:999', ownerHash: 'h' } });
    await expect(ensureSignedIn(1)).rejects.toThrow(/unexpected uid/);
    expect(signOut).toHaveBeenCalled();
  });
});

/** A promise plus its resolver, so a test can decide when a sign-in lands. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Mint returns `token-<id>`; signing in with it becomes `char:<id>`. */
function mintPerCharacter() {
  vi.mocked(getValidAccessToken).mockImplementation(async (id) => `access-${id}`);
  mint.mockImplementation(async ({ accessToken }: { accessToken: string }) => {
    const id = accessToken.replace('access-', '');
    return { data: { token: `token-${id}`, uid: `char:${id}`, ownerHash: 'h' } };
  });
}

/** Flush enough microtasks for queued sign-ins to reach `signInWithCustomToken`. */
async function flush() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

describe('ensureSignedIn under concurrent sign-ins', () => {
  beforeEach(async () => {
    // A leftover sign-in from an earlier test must not leak into this one.
    await signOutOfSync();
    fakeAuth.currentUser = null;
    vi.clearAllMocks();
    mintPerCharacter();
  });

  it('never resolves while another character owns the session', async () => {
    // Firebase swaps `currentUser` as soon as a sign-in lands, but the promise
    // only settles when the test says so: the last sign-in to land owns the
    // session, whichever order the callers hear back in.
    const landings = new Map<string, ReturnType<typeof deferred<void>>>();
    vi.mocked(signInWithCustomToken).mockImplementation(async (_auth, token) => {
      const user = { uid: token.replace('token-', 'char:') };
      fakeAuth.currentUser = user;
      const gate = deferred<void>();
      landings.set(token, gate);
      await gate.promise;
      return { user } as never;
    });

    const ownerWhenResolved: Record<string, string | undefined> = {};
    const a = ensureSignedIn(1).then((uid) => {
      ownerWhenResolved.a = fakeAuth.currentUser?.uid;
      return uid;
    });
    const b = ensureSignedIn(2).then((uid) => {
      ownerWhenResolved.b = fakeAuth.currentUser?.uid;
      return uid;
    });

    await flush();
    // B hears back first (if it was allowed to start), A last.
    landings.get('token-2')?.resolve();
    await flush();
    landings.get('token-1')?.resolve();
    await flush();
    landings.get('token-2')?.resolve();
    await flush();
    landings.get('token-1')?.resolve();

    const results = await Promise.allSettled([a, b]);
    for (const [key, result, expected] of [
      ['a', results[0], 'char:1'],
      ['b', results[1], 'char:2'],
    ] as const) {
      if (result.status === 'fulfilled') {
        expect(result.value).toBe(expected);
        expect(ownerWhenResolved[key]).toBe(expected);
      }
    }
  });

  it('retries once when a concurrent sign-in overtook it, then resolves as itself', async () => {
    let calls = 0;
    vi.mocked(signInWithCustomToken).mockImplementation(async (_auth, token) => {
      calls++;
      const user = { uid: token.replace('token-', 'char:') };
      // First landing is immediately overtaken by another character's session.
      fakeAuth.currentUser = calls === 1 ? { uid: 'char:2' } : user;
      return { user } as never;
    });

    await expect(ensureSignedIn(1)).resolves.toBe('char:1');
    expect(fakeAuth.currentUser?.uid).toBe('char:1');
    expect(signInWithCustomToken).toHaveBeenCalledTimes(2);
  });

  it('throws when it is overtaken again on the retry', async () => {
    vi.mocked(signInWithCustomToken).mockImplementation(async (_auth, token) => {
      const user = { uid: token.replace('token-', 'char:') };
      fakeAuth.currentUser = { uid: 'char:2' };
      return { user } as never;
    });

    await expect(ensureSignedIn(1)).rejects.toThrow(/char:2/);
    expect(signInWithCustomToken).toHaveBeenCalledTimes(2);
  });
});

describe('ensureAnySession', () => {
  beforeEach(async () => {
    await signOutOfSync();
    fakeAuth.currentUser = null;
    vi.clearAllMocks();
    mintPerCharacter();
    vi.mocked(signInWithCustomToken).mockImplementation(async (_auth, token) => {
      const user = { uid: token.replace('token-', 'char:') };
      fakeAuth.currentUser = user;
      return { user } as never;
    });
  });

  it('reuses whatever session is already signed in, even another character', async () => {
    fakeAuth.currentUser = { uid: 'char:2' };
    await expect(ensureAnySession(1)).resolves.toBe('char:2');
    expect(mint).not.toHaveBeenCalled();
    expect(signInWithCustomToken).not.toHaveBeenCalled();
    expect(fakeAuth.currentUser?.uid).toBe('char:2');
  });

  it('waits for an in-flight sign-in instead of starting its own', async () => {
    const gate = deferred<void>();
    vi.mocked(signInWithCustomToken).mockImplementation(async (_auth, token) => {
      await gate.promise;
      const user = { uid: token.replace('token-', 'char:') };
      fakeAuth.currentUser = user;
      return { user } as never;
    });

    const alt = ensureSignedIn(2);
    await flush();
    const any = ensureAnySession(1);
    await flush();
    gate.resolve();

    await expect(alt).resolves.toBe('char:2');
    await expect(any).resolves.toBe('char:2');
    expect(signInWithCustomToken).toHaveBeenCalledTimes(1);
    expect(fakeAuth.currentUser?.uid).toBe('char:2');
  });

  it('signs in as the fallback character only when there is no session', async () => {
    await expect(ensureAnySession(1)).resolves.toBe('char:1');
    expect(getValidAccessToken).toHaveBeenCalledWith(1);
    expect(signInWithCustomToken).toHaveBeenCalledTimes(1);
    expect(fakeAuth.currentUser?.uid).toBe('char:1');
  });

  it('falls back when the in-flight sign-in failed and left no session', async () => {
    mint.mockRejectedValueOnce(new Error('mint failed'));
    const alt = ensureSignedIn(2);
    const any = ensureAnySession(1);

    await expect(alt).rejects.toThrow(/mint failed/);
    await expect(any).resolves.toBe('char:1');
  });
});
