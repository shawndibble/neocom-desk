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

import { bookFeederFrom, editBook, reclaimBook, unknownAction } from './bookClient';

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
    expect(fns.httpsCallable).toHaveBeenCalledWith('functions', 'corpTaxBookCall');
    expect(fns.callable).toHaveBeenCalledWith({
      action: 'reclaimCorpTaxBookCallable',
      data: { corporationId: 98000001, accessToken: 'access-token' },
    });
  });
});

describe('editBook', () => {
  it.each(['reassignPayment', 'resetCheckpoint', 'writeOff'])(
    'sends the access token with %s, which the server re-checks live',
    async (action) => {
      fns.callable.mockResolvedValue({ data: {} });
      await editBook(7, 98000001, { action });
      expect(fns.callable.mock.calls[0]?.[0].data).toMatchObject({ accessToken: 'access-token' });
    }
  );

  it('sends no token with an edit the role cache covers', async () => {
    fns.callable.mockResolvedValue({ data: {} });
    await editBook(7, 98000001, { action: 'assignPayment' });
    expect(token).not.toHaveBeenCalled();
  });
});

describe('unknownAction (M7)', () => {
  const err = (code: string, message: string, reason?: string) =>
    Object.assign(new Error(message), { code, ...(reason ? { details: { reason } } : {}) });
  it("falls back on the server's unknown-action answer, old or new", () => {
    expect(unknownAction(err('functions/invalid-argument', 'x', 'unknown-action'))).toBe(true);
    expect(unknownAction(err('functions/invalid-argument', 'Unknown action'))).toBe(true);
    expect(
      unknownAction(err('functions/invalid-argument', 'action must be one of addRate, dismiss'))
    ).toBe(true);
  });

  it("never on a known action's own refusal", () => {
    expect(unknownAction(err('functions/invalid-argument', 'notice.code must be MT1'))).toBe(false);
    expect(unknownAction(err('functions/invalid-argument', 'x', 'notice-exists'))).toBe(false);
    expect(unknownAction(err('functions/not-found', 'Payment not found'))).toBe(false);
  });
});

describe('bookFeederFrom', () => {
  const record = {
    corporationId: 5,
    status: 'active' as const,
    mode: 'settled-otherwise' as const,
    invitedBy: 3,
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
