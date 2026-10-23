import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { SrpOfficerVerdict } from '../srpTypes';

const client = vi.hoisted(() => ({ verifySrpOfficer: vi.fn() }));
vi.mock('../srpClient', () => client);
const officer = vi.hoisted(() => ({
  readSrpClaims: vi.fn(),
  readSrpActivity: vi.fn(),
  readSrpClaimAudit: vi.fn(),
  approveSrpClaim: vi.fn(),
  approveSrpClaims: vi.fn(),
  changeSrpClaimAmount: vi.fn(),
  markSrpClaimPaid: vi.fn(),
  markSrpClaimsPaid: vi.fn(),
  rejectSrpClaim: vi.fn(),
}));
vi.mock('../srpOfficerClient', () => officer);
vi.mock('../owner', () => ({ useActiveCorporationId: () => 98 }));
vi.mock('@/stores/activeCharacter', () => ({
  useActiveCharacter: (select: (s: { activeCharacterId: number }) => unknown) =>
    select({ activeCharacterId: 7 }),
}));

import { useSrpQueue } from './useSrpQueue';

const verdict = (over: Partial<SrpOfficerVerdict> = {}): SrpOfficerVerdict => ({
  corporationId: 98,
  isCeo: false,
  isDirector: false,
  canManage: true,
  srpEnabled: true,
  expiresAt: 1,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  client.verifySrpOfficer.mockResolvedValue(verdict());
  officer.readSrpClaims.mockResolvedValue([]);
  officer.readSrpActivity.mockResolvedValue([]);
  officer.approveSrpClaim.mockResolvedValue({ killmailId: 1 });
});

describe('useSrpQueue', () => {
  it('verifies the officer before it reads the claims, and an Accountant gets the queue', async () => {
    const { result } = renderHook(() => useSrpQueue());
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(client.verifySrpOfficer.mock.invocationCallOrder[0]).toBeLessThan(
      officer.readSrpClaims.mock.invocationCallOrder[0]!
    );
  });

  it('reads nothing for roles that cannot manage SRP', async () => {
    client.verifySrpOfficer.mockResolvedValue(verdict({ canManage: false }));
    const { result } = renderHook(() => useSrpQueue());
    await waitFor(() => expect(result.current.state.status).toBe('denied'));
    expect(officer.readSrpClaims).not.toHaveBeenCalled();
  });

  it('maps a permission error to denied and others to failed', async () => {
    client.verifySrpOfficer.mockRejectedValueOnce({ code: 'functions/permission-denied' });
    const denied = renderHook(() => useSrpQueue());
    await waitFor(() => expect(denied.result.current.state.status).toBe('denied'));
    officer.readSrpClaims.mockRejectedValueOnce(new Error('offline'));
    const failed = renderHook(() => useSrpQueue());
    await waitFor(() =>
      expect(failed.result.current.state).toEqual({ status: 'failed', message: 'offline' })
    );
  });

  it('reloads after an action, even a refused one', async () => {
    const { result } = renderHook(() => useSrpQueue());
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    const reads = officer.readSrpClaims.mock.calls.length;
    await act(() => result.current.approve({ killmailId: 1 }));
    expect(officer.approveSrpClaim).toHaveBeenCalledWith(7, 98, { killmailId: 1 });
    await waitFor(() => expect(officer.readSrpClaims.mock.calls.length).toBeGreaterThan(reads));
    const again = officer.readSrpClaims.mock.calls.length;
    officer.approveSrpClaim.mockRejectedValueOnce(new Error('nope'));
    await act(async () => {
      await expect(result.current.approve({ killmailId: 2 })).rejects.toThrow('nope');
    });
    await waitFor(() => expect(officer.readSrpClaims.mock.calls.length).toBeGreaterThan(again));
  });
});
