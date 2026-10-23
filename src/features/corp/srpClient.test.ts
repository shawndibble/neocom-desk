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

import {
  getSrpStatus,
  reclaimSrp,
  saveSrpSettings,
  turnOffSrp,
  turnOnSrp,
  verifySrpOfficer,
} from './srpClient';

const CORP = 98000001;
const sent = (action: string, data: Record<string, unknown>) => {
  expect(fns.httpsCallable).toHaveBeenCalledWith('functions', 'corpTaxBookCall');
  expect(fns.callable).toHaveBeenCalledWith({ action, data });
};

beforeEach(() => {
  vi.clearAllMocks();
  token.mockResolvedValue('access-token');
  fns.httpsCallable.mockReturnValue(fns.callable);
  fns.callable.mockResolvedValue({ data: { ok: true } });
});

describe('SRP client', () => {
  it('sends the access token, never a refresh token, with every call', async () => {
    await verifySrpOfficer(7, CORP);
    sent('verifySrpOfficerCallable', { corporationId: CORP, accessToken: 'access-token' });
    await getSrpStatus(7, CORP);
    sent('getSrpStatusCallable', { corporationId: CORP, accessToken: 'access-token' });
    await turnOnSrp(7, CORP);
    sent('turnOnSrpCallable', { corporationId: CORP, accessToken: 'access-token' });
    await turnOffSrp(7, CORP);
    sent('turnOffSrpCallable', { corporationId: CORP, accessToken: 'access-token' });
    await reclaimSrp(7, CORP);
    sent('reclaimSrpCallable', { corporationId: CORP, accessToken: 'access-token' });
    expect(token).toHaveBeenCalledWith(7);
  });

  it('carries the settings patch to saveSrpSettingsCallable', async () => {
    const settings = {
      killmailPct: 80,
      hullRules: [{ scope: 'hull' as const, id: 587, kind: 'not-covered' as const }],
    };
    await saveSrpSettings(7, CORP, settings);
    sent('saveSrpSettingsCallable', { corporationId: CORP, accessToken: 'access-token', settings });
  });

  it('returns the callable’s answer', async () => {
    fns.callable.mockResolvedValue({ data: { officersRevoked: 2 } });
    expect(await reclaimSrp(7, CORP)).toEqual({ officersRevoked: 2 });
  });
});
