import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signInWithCustomToken, signOut } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { getValidAccessToken } from '@/auth/session';
import { ensureSignedIn, uidForCharacter } from './syncAuth';

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

beforeEach(() => {
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
