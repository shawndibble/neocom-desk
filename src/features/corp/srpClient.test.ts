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

const store = vi.hoisted(() => ({ doc: vi.fn(), getDoc: vi.fn() }));
vi.mock('firebase/firestore/lite', () => ({ doc: store.doc, getDoc: store.getDoc }));

import {
  fileSrpClaim,
  getSrpStatus,
  invalidateSrpOfficer,
  readSrpSettings,
  reclaimSrp,
  saveSrpSettings,
  turnOffSrp,
  turnOnSrp,
  SRP_VERIFY_TTL_MS,
  verifySrpOfficer,
} from './srpClient';

const CORP = 98000001;
const sent = (action: string, data: Record<string, unknown>) => {
  expect(fns.httpsCallable).toHaveBeenCalledWith('functions', 'corpTaxBookCall');
  expect(fns.callable).toHaveBeenCalledWith({ action, data });
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  invalidateSrpOfficer();
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

  it('files a claim with the link and notes, never hull or amount', async () => {
    const claim = { killmail: 'https://zkillboard.com/kill/9/', fleetOrFc: 'Alpha' };
    await fileSrpClaim(7, CORP, claim);
    sent('fileSrpClaimCallable', { corporationId: CORP, accessToken: 'access-token', ...claim });
  });

  it('returns the callable’s answer', async () => {
    fns.callable.mockResolvedValue({ data: { officersRevoked: 2 } });
    expect(await reclaimSrp(7, CORP)).toEqual({ officersRevoked: 2 });
  });

  it('reads the settings doc under the corp umbrella, null when SRP was never turned on', async () => {
    store.doc.mockReturnValue('ref');
    store.getDoc.mockResolvedValueOnce({ exists: () => true, data: () => ({ enabled: true }) });
    await expect(readSrpSettings(7, CORP)).resolves.toEqual({ enabled: true });
    expect(store.doc).toHaveBeenCalledWith(undefined, 'corps', String(CORP), 'srp', 'settings');
    store.getDoc.mockResolvedValueOnce({ exists: () => false });
    await expect(readSrpSettings(7, CORP)).resolves.toBeNull();
  });

  describe('officer verdict memo', () => {
    const verifies = () =>
      fns.callable.mock.calls.filter(([c]) => c.action === 'verifySrpOfficerCallable').length;

    it('asks once for concurrent and repeat calls within the TTL, then again after it', async () => {
      vi.useFakeTimers();
      await Promise.all([verifySrpOfficer(7, CORP), verifySrpOfficer(7, CORP)]);
      await verifySrpOfficer(7, CORP);
      expect(verifies()).toBe(1);
      await verifySrpOfficer(8, CORP);
      expect(verifies()).toBe(2);
      vi.advanceTimersByTime(SRP_VERIFY_TTL_MS + 1);
      await verifySrpOfficer(7, CORP);
      expect(verifies()).toBe(3);
    });

    it('asks again after a write that changes it, or an explicit invalidation', async () => {
      for (const write of [
        turnOnSrp,
        turnOffSrp,
        reclaimSrp,
        (c: number, k: number) => saveSrpSettings(c, k, { windowDays: 5 }),
      ]) {
        await verifySrpOfficer(7, CORP);
        const before = verifies();
        await verifySrpOfficer(7, CORP);
        expect(verifies()).toBe(before);
        await write(7, CORP);
        await verifySrpOfficer(7, CORP);
        expect(verifies()).toBe(before + 1);
      }
      invalidateSrpOfficer(7, CORP);
      const n = verifies();
      await verifySrpOfficer(7, CORP);
      expect(verifies()).toBe(n + 1);
    });

    it('does not remember a failed ask', async () => {
      fns.callable.mockRejectedValueOnce(new Error('offline'));
      await expect(verifySrpOfficer(7, CORP)).rejects.toThrow();
      await verifySrpOfficer(7, CORP);
      expect(verifies()).toBe(2);
    });
  });
});
