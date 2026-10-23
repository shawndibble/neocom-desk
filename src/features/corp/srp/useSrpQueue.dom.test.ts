import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { SrpClaim } from '../srpClaimTypes';
import type { SrpOfficerVerdict } from '../srpTypes';
import type { SrpQueueState } from './useSrpQueue';

const client = vi.hoisted(() => ({ verifySrpOfficer: vi.fn() }));
vi.mock('../srpClient', () => client);
const officer = vi.hoisted(() => ({
  readSrpClaims: vi.fn(),
  readSrpActivity: vi.fn(),
  readSrpHistory: vi.fn(),
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

const claim = (killmailId: number, state: SrpClaim['state']) =>
  ({ killmailId, state, amount: 5, filedAt: killmailId }) as SrpClaim;
const historyOf = (result: { current: { state: SrpQueueState } }) => {
  const s = result.current.state;
  if (s.status !== 'ready') throw new Error('not ready');
  return s.history;
};

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
  officer.readSrpHistory.mockResolvedValue([]);
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

  it('reads no history until asked, then newest first with a wider limit for older', async () => {
    const { result } = renderHook(() => useSrpQueue());
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(officer.readSrpHistory).not.toHaveBeenCalled();
    officer.readSrpHistory.mockResolvedValue(
      Array.from({ length: 100 }, (_, i) => claim(i + 1000, 'paid'))
    );
    act(() => result.current.loadHistory());
    await waitFor(() => expect(historyOf(result).status).toBe('ready'));
    expect(officer.readSrpHistory).toHaveBeenCalledWith(7, 98, 100);
    expect(historyOf(result)).toMatchObject({ more: true, limit: 100 });
    act(() => result.current.loadOlderHistory());
    await waitFor(() => expect(officer.readSrpHistory).toHaveBeenCalledWith(7, 98, 200));
  });

  it('applies an outcome locally and re-reads only the activity, never the claims', async () => {
    officer.readSrpClaims.mockResolvedValue([claim(1, 'pending'), claim(2, 'approved')]);
    officer.markSrpClaimPaid.mockResolvedValue({ killmailId: 2, state: 'paid', amount: 5 });
    const { result } = renderHook(() => useSrpQueue());
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    const reads = officer.readSrpClaims.mock.calls.length;
    const feed = officer.readSrpActivity.mock.calls.length;
    await act(() => result.current.markPaid({ killmailId: 2, expectedAmount: 5 }));
    expect(officer.markSrpClaimPaid).toHaveBeenCalledWith(7, 98, {
      killmailId: 2,
      expectedAmount: 5,
    });
    await waitFor(() => expect(officer.readSrpActivity.mock.calls.length).toBeGreaterThan(feed));
    expect(officer.readSrpClaims.mock.calls.length).toBe(reads);
    const state = result.current.state;
    if (state.status !== 'ready') throw new Error('not ready');
    expect(state.claims.map((c) => c.killmailId)).toEqual([1]);
  });

  it('puts a closed claim at the top of a loaded History', async () => {
    officer.readSrpClaims.mockResolvedValue([claim(1, 'pending')]);
    officer.readSrpHistory.mockResolvedValue([claim(9, 'paid')]);
    officer.rejectSrpClaim.mockResolvedValue({
      killmailId: 1,
      state: 'rejected',
      amount: 5,
      reason: 'no',
    });
    const { result } = renderHook(() => useSrpQueue());
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    act(() => result.current.loadHistory());
    await waitFor(() => expect(historyOf(result).status).toBe('ready'));
    await act(() => result.current.reject(1, 'no'));
    const h = historyOf(result);
    expect(h.status === 'ready' && h.claims.map((c) => c.killmailId)).toEqual([1, 9]);
  });

  it('re-reads the open claims after a refusal, and after a batch with a refused claim', async () => {
    const { result } = renderHook(() => useSrpQueue());
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    const reads = officer.readSrpClaims.mock.calls.length;
    officer.approveSrpClaim.mockRejectedValueOnce(new Error('nope'));
    await act(async () => {
      await expect(result.current.approve({ killmailId: 2 })).rejects.toThrow('nope');
    });
    await waitFor(() => expect(officer.readSrpClaims.mock.calls.length).toBe(reads + 1));
    officer.approveSrpClaims.mockResolvedValue({
      results: [{ ok: false, killmailId: 3, reason: 'amount-changed', message: '' }],
    });
    await act(() => result.current.approveMany([{ killmailId: 3, expectedAmount: 1 }]));
    await waitFor(() => expect(officer.readSrpClaims.mock.calls.length).toBe(reads + 2));
  });

  it('sends a batch of 120 as three calls of at most 50', async () => {
    officer.approveSrpClaims.mockImplementation(
      async (_c: number, _o: number, chunk: { killmailId: number }[]) => ({
        results: chunk.map((c) => ({
          ok: true,
          killmailId: c.killmailId,
          state: 'approved',
          characterId: 1,
          characterName: 'P',
          amount: 1,
        })),
      })
    );
    const { result } = renderHook(() => useSrpQueue());
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    const out = await act(() =>
      result.current.approveMany(Array.from({ length: 120 }, (_, i) => ({ killmailId: i + 1 })))
    );
    expect(officer.approveSrpClaims.mock.calls.map((c) => c[2].length)).toEqual([50, 50, 20]);
    expect(out.results).toHaveLength(120);
  });
});
