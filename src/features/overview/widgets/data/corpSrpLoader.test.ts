import { beforeEach, describe, expect, it, vi } from 'vitest';

const resolveCorpReadAccess = vi.fn();
const verifySrpOfficer = vi.fn();
const readOpenSrpClaims = vi.fn();
vi.mock('@/features/corp/corpReadAccess', () => ({
  resolveCorpReadAccess: (...a: unknown[]) => resolveCorpReadAccess(...a),
}));
vi.mock('@/features/corp/srpClient', () => ({
  verifySrpOfficer: (...a: unknown[]) => verifySrpOfficer(...a),
}));
vi.mock('@/features/corp/srpOfficerClient', () => ({
  readSrpClaims: (...a: unknown[]) => readOpenSrpClaims(...a),
}));
vi.mock('@/features/character/typeNames', () => ({
  loadTypeNames: async () => new Map([[587, 'Rifter']]),
}));
vi.mock('@/sde/solarSystems', () => ({
  loadSolarSystemsById: async () => new Map([[30000142, { name: 'Jita' }]]),
}));

import { loadCorpSrp } from './corpFeedLoaders';

const CORP = 98000001;
const verdict = (over: Record<string, unknown> = {}) => ({
  corporationId: CORP,
  isCeo: false,
  isDirector: false,
  canManage: true,
  srpEnabled: true,
  expiresAt: 1,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  resolveCorpReadAccess.mockResolvedValue({ corporationId: CORP, can: () => true });
  verifySrpOfficer.mockResolvedValue(verdict());
  readOpenSrpClaims.mockResolvedValue([]);
});

describe('loadCorpSrp', () => {
  it('asks Firebase nothing without the SRP officer capability', async () => {
    resolveCorpReadAccess.mockResolvedValue({ corporationId: CORP, can: () => false });
    expect((await loadCorpSrp(1)).readable).toBe(false);
    resolveCorpReadAccess.mockResolvedValue(null);
    expect((await loadCorpSrp(1)).readable).toBe(false);
    expect(verifySrpOfficer).not.toHaveBeenCalled();
  });

  it('is unreadable when the live check says the Character is no officer', async () => {
    verifySrpOfficer.mockResolvedValue(verdict({ canManage: false }));
    expect((await loadCorpSrp(1)).readable).toBe(false);
    expect(readOpenSrpClaims).not.toHaveBeenCalled();
  });

  it('reads no claims while SRP is off, and says whether a Director can set it up', async () => {
    verifySrpOfficer.mockResolvedValue(verdict({ srpEnabled: false, isDirector: true }));
    const feed = await loadCorpSrp(1);
    expect(feed).toMatchObject({ readable: true, enabled: false, canSetUp: true });
    expect(readOpenSrpClaims).not.toHaveBeenCalled();
  });

  it('carries the open claims with hull and system names', async () => {
    readOpenSrpClaims.mockResolvedValue([
      { killmailId: 1, hullTypeId: 587, solarSystemId: 30000142, state: 'pending' },
    ]);
    const feed = await loadCorpSrp(7);
    expect(readOpenSrpClaims).toHaveBeenCalledWith(7, CORP);
    expect(feed.enabled).toBe(true);
    expect(feed.typeNames.get(587)).toBe('Rifter');
    expect(feed.systemNames.get(30000142)).toBe('Jita');
  });

  it('lets a failed read throw so the widget shows Retry', async () => {
    readOpenSrpClaims.mockRejectedValue(new Error('permission-denied'));
    await expect(loadCorpSrp(1)).rejects.toThrow();
  });
});
