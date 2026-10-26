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
vi.mock('firebase/firestore/lite', () => ({
  collection: vi.fn(),
  getDocs: vi.fn(),
  limit: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
}));

import { getDocs, limit, orderBy } from 'firebase/firestore/lite';
import {
  SRP_READ_CAP,
  approveSrpClaim,
  approveSrpClaims,
  changeSrpClaimAmount,
  markSrpClaimPaid,
  markSrpClaimsPaid,
  readAllSrpClaims,
  readSrpActivity,
  rejectSrpClaim,
} from './srpOfficerClient';
import { DOCTRINE_READ_CAP, readSrpDoctrines } from './srpDoctrineClient';
import { invalidateSrpOfficer, verifySrpOfficer } from './srpClient';

const CORP = 98000001;
const sent = (action: string, data: Record<string, unknown>) => {
  expect(fns.httpsCallable).toHaveBeenCalledWith('functions', 'corpTaxBookCall');
  expect(fns.callable).toHaveBeenLastCalledWith({ action, data });
};

beforeEach(() => {
  vi.clearAllMocks();
  invalidateSrpOfficer();
  token.mockResolvedValue('access-token');
  fns.httpsCallable.mockReturnValue(fns.callable);
  fns.callable.mockResolvedValue({ data: { ok: true } });
});

describe('SRP officer client', () => {
  it('sends each action with the access token and the claim', async () => {
    const auth = { corporationId: CORP, accessToken: 'access-token' };
    await approveSrpClaim(7, CORP, { killmailId: 5, amount: 9, reason: 'r' });
    sent('approveSrpClaimCallable', { ...auth, killmailId: 5, amount: 9, reason: 'r' });
    await approveSrpClaims(7, CORP, [{ killmailId: 5 }, { killmailId: 6 }]);
    sent('approveSrpClaimsCallable', { ...auth, claims: [{ killmailId: 5 }, { killmailId: 6 }] });
    await rejectSrpClaim(7, CORP, 5, 'solo');
    sent('rejectSrpClaimCallable', { ...auth, killmailId: 5, reason: 'solo' });
    await changeSrpClaimAmount(7, CORP, 5, 100, 'why');
    sent('changeSrpClaimAmountCallable', { ...auth, killmailId: 5, amount: 100, reason: 'why' });
    await markSrpClaimPaid(7, CORP, { killmailId: 5, expectedAmount: 90 });
    sent('markSrpClaimPaidCallable', { ...auth, killmailId: 5, expectedAmount: 90 });
    const items = [
      { killmailId: 5, expectedAmount: 90 },
      { killmailId: 6, expectedAmount: null },
    ];
    await markSrpClaimsPaid(7, CORP, items);
    sent('markSrpClaimsPaidCallable', { ...auth, claims: items });
    expect(token).toHaveBeenCalledWith(7);
  });

  it('forgets the remembered officer verdict after a refusal or a failed call', async () => {
    const verifies = () =>
      fns.callable.mock.calls.filter(([c]) => c.action === 'verifySrpOfficerCallable').length;
    await verifySrpOfficer(7, CORP);
    fns.callable.mockResolvedValueOnce({
      data: { results: [{ ok: false, killmailId: 5, reason: 'amount-changed', message: 'm' }] },
    });
    await markSrpClaimsPaid(7, CORP, [{ killmailId: 5, expectedAmount: 1 }]);
    await verifySrpOfficer(7, CORP);
    expect(verifies()).toBe(2);
    fns.callable.mockRejectedValueOnce(new Error('permission-denied'));
    await expect(rejectSrpClaim(7, CORP, 5, 'x')).rejects.toThrow();
    await verifySrpOfficer(7, CORP);
    expect(verifies()).toBe(3);
  });
});

describe('SRP list reads', () => {
  beforeEach(() => {
    vi.mocked(getDocs).mockResolvedValue({ docs: [] } as never);
  });

  it('bound the whole-collection claim read', async () => {
    await readAllSrpClaims(7, CORP);
    expect(limit).toHaveBeenCalledWith(SRP_READ_CAP);
  });

  it('bound the whole audit log read, newest first', async () => {
    await readSrpActivity(7, CORP, null);
    expect(orderBy).toHaveBeenCalledWith('at', 'desc');
    expect(limit).toHaveBeenCalledWith(SRP_READ_CAP);
  });

  it('keep a requested audit count', async () => {
    await readSrpActivity(7, CORP, 25);
    expect(limit).toHaveBeenCalledWith(25);
  });

  it('bound the Doctrine Fit read', async () => {
    await readSrpDoctrines(7, CORP);
    expect(limit).toHaveBeenCalledWith(DOCTRINE_READ_CAP);
  });
});
