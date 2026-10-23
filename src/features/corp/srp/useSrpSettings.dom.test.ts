import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { SrpOfficerVerdict, SrpSettings } from '../srpTypes';

const client = vi.hoisted(() => ({
  verifySrpOfficer: vi.fn(),
  readSrpSettings: vi.fn(),
  saveSrpSettings: vi.fn(),
  turnOnSrp: vi.fn(),
  turnOffSrp: vi.fn(),
  reclaimSrp: vi.fn(),
}));
vi.mock('../srpClient', () => client);
vi.mock('../owner', () => ({ useActiveCorporationId: () => 98 }));
vi.mock('@/stores/activeCharacter', () => ({
  useActiveCharacter: (select: (s: { activeCharacterId: number }) => unknown) =>
    select({ activeCharacterId: 7 }),
}));

import { useSrpSettings } from './useSrpSettings';

const verdict = (over: Partial<SrpOfficerVerdict> = {}): SrpOfficerVerdict => ({
  corporationId: 98,
  isCeo: false,
  isDirector: true,
  canManage: true,
  srpEnabled: true,
  expiresAt: 1,
  ...over,
});
const settings = { corporationId: 98, enabled: true, updatedAt: 1 } as SrpSettings;

beforeEach(() => {
  vi.clearAllMocks();
  client.verifySrpOfficer.mockResolvedValue(verdict());
  client.readSrpSettings.mockResolvedValue(settings);
});

describe('useSrpSettings', () => {
  it('verifies the officer before it reads the settings', async () => {
    const { result } = renderHook(() => useSrpSettings());
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(client.verifySrpOfficer).toHaveBeenCalledWith(7, 98);
    expect(client.verifySrpOfficer.mock.invocationCallOrder[0]).toBeLessThan(
      client.readSrpSettings.mock.invocationCallOrder[0]!
    );
  });

  it('stops at not-director for an Accountant, without reading the settings', async () => {
    client.verifySrpOfficer.mockResolvedValue(verdict({ isDirector: false }));
    const { result } = renderHook(() => useSrpSettings());
    await waitFor(() => expect(result.current.state.status).toBe('not-director'));
    expect(client.readSrpSettings).not.toHaveBeenCalled();
  });

  it('is never-on when SRP has no settings doc', async () => {
    client.readSrpSettings.mockResolvedValue(null);
    const { result } = renderHook(() => useSrpSettings());
    await waitFor(() => expect(result.current.state.status).toBe('never-on'));
  });

  it('treats a refused read after verify as never-on: no settings doc means no officer record yet', async () => {
    client.readSrpSettings.mockRejectedValue({ code: 'permission-denied' });
    const { result } = renderHook(() => useSrpSettings());
    await waitFor(() => expect(result.current.state.status).toBe('never-on'));
  });

  it('maps permission errors to denied and others to failed', async () => {
    client.verifySrpOfficer.mockRejectedValueOnce({ code: 'functions/permission-denied' });
    const denied = renderHook(() => useSrpSettings());
    await waitFor(() => expect(denied.result.current.state.status).toBe('denied'));
    client.verifySrpOfficer.mockRejectedValueOnce(new Error('offline'));
    const failed = renderHook(() => useSrpSettings());
    await waitFor(() =>
      expect(failed.result.current.state).toEqual({ status: 'failed', message: 'offline' })
    );
  });

  it('saves the patch, then flips on/off, and reloads even when a step fails', async () => {
    const { result } = renderHook(() => useSrpSettings());
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    await act(() => result.current.save({ windowDays: 45 }, false));
    expect(client.saveSrpSettings).toHaveBeenCalledWith(7, 98, { windowDays: 45 });
    expect(client.turnOffSrp).toHaveBeenCalledWith(7, 98);
    const reads = client.readSrpSettings.mock.calls.length;
    client.saveSrpSettings.mockRejectedValueOnce(new Error('nope'));
    await act(async () => {
      await expect(result.current.save({ windowDays: 5 }, null)).rejects.toThrow('nope');
    });
    await waitFor(() => expect(client.readSrpSettings.mock.calls.length).toBeGreaterThan(reads));
    expect(client.turnOnSrp).not.toHaveBeenCalled();
  });
});
