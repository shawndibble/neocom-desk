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

import { bookFeederFrom, reclaimBook } from './bookClient';

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

describe('bookFeederFrom', () => {
  const record = {
    corporationId: 5,
    status: 'active' as const,
    mode: 'settled-otherwise' as const,
    joinedAt: 1,
    agreedRatePct: 6,
    coveragePeriods: [{ from: '2026-10-01' }],
  };
  const payout = {
    id: 'p1',
    date: '2026-10-05',
    amount: 100,
    method: 'donation' as const,
    status: 'recorded' as const,
    notAPayout: false,
  };

  it('keeps the whole record, turns the last good read into an ISO string and carries payouts', () => {
    expect(bookFeederFrom({ ...record, lastReadWellAt: Date.UTC(2026, 9, 5) }, [payout])).toEqual({
      ...record,
      lastReadWellAt: '2026-10-05T00:00:00.000Z',
      payouts: [payout],
    });
  });

  it('leaves the clock absent when no read has landed', () => {
    expect(bookFeederFrom(record, [])).not.toHaveProperty('lastReadWellAt');
  });
});
