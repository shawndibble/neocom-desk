import { beforeEach, describe, expect, it, vi } from 'vitest';

const fns = vi.hoisted(() => ({ callable: vi.fn(), httpsCallable: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: fns.httpsCallable }));
vi.mock('@/sync/firebaseApp', () => ({
  getSyncFirestore: vi.fn(),
  getSyncFunctions: () => 'functions',
}));
vi.mock('@/sync/syncAuth', () => ({ ensureSignedIn: vi.fn().mockResolvedValue(undefined) }));
const token = vi.hoisted(() => vi.fn());
vi.mock('@/auth/session', () => ({ getValidAccessToken: token }));

import { reclaimBook } from './bookClient';

beforeEach(() => {
  vi.clearAllMocks();
  token.mockResolvedValue('access-token');
  fns.httpsCallable.mockReturnValue(fns.callable);
  fns.callable.mockResolvedValue({ data: { officersRevoked: 3 } });
});

describe('reclaimBook', () => {
  it('sends only the access token to reclaimCorpTaxBookCallable and returns officersRevoked', async () => {
    expect(await reclaimBook(7, 98000001)).toEqual({ officersRevoked: 3 });
    expect(token).toHaveBeenCalledWith(7);
    expect(fns.httpsCallable).toHaveBeenCalledWith('functions', 'reclaimCorpTaxBookCallable');
    expect(fns.callable).toHaveBeenCalledWith({
      corporationId: 98000001,
      accessToken: 'access-token',
    });
  });
});
