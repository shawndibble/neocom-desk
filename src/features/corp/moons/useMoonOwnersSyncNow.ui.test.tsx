import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import '@/i18n';
import type { MoonOwnerRow } from '@/engine/corpTaxBook/moonOwners';
import { useMoonOwnersSyncNow } from './useMoonOwnersSyncNow';

const reload = vi.fn();
const syncMoonOwnersNowRemote = vi.fn();
let canEdit = true;

vi.mock('./useBook', () => ({
  useBook: () => ({ characterId: 7, corporationId: 98000001, canEdit, reload }),
}));
vi.mock('@/sync/corpSyncGrantApi', () => ({
  syncMoonOwnersNowRemote: (...a: unknown[]) => syncMoonOwnersNowRemote(...a),
}));

const row = (status: MoonOwnerRow['status']): MoonOwnerRow => ({
  id: '5',
  corporationId: 5,
  status,
  refineryCount: 1,
  mined: 0,
  owed: 0,
  balance: { kind: 'none', isk: 0 },
  mode: 'normal',
});

beforeEach(() => {
  reload.mockReset();
  syncMoonOwnersNowRemote.mockReset();
  canEdit = true;
});

describe('Sync now for moon owners', () => {
  it('reads every moon owner of the book, then reloads it', async () => {
    syncMoonOwnersNowRemote.mockResolvedValue({ kind: 'synced', read: 1, stale: 0, skipped: 0 });
    const { result } = renderHook(() => useMoonOwnersSyncNow([row('active')]));
    expect(result.current.enabled).toBe(true);
    await act(() => result.current.run());
    expect(syncMoonOwnersNowRemote).toHaveBeenCalledWith({
      editorCharacterId: 7,
      collectorCorporationId: 98000001,
    });
    expect(reload).toHaveBeenCalledTimes(1);
    expect(result.current.notice).toBeNull();
  });

  it('a press too soon says when it reads again, and reloads nothing', async () => {
    syncMoonOwnersNowRemote.mockResolvedValue({
      kind: 'rate-limited',
      retryAt: Date.UTC(2026, 10, 12, 8, 40),
    });
    const { result } = renderHook(() => useMoonOwnersSyncNow([row('active')]));
    await act(() => result.current.run());
    await waitFor(() => expect(result.current.notice?.message).toContain('08:40'));
    expect(reload).not.toHaveBeenCalled();
  });

  it('is on for a book whose only moon owner has no rate yet (still read on the schedule)', () => {
    expect(renderHook(() => useMoonOwnersSyncNow([row('no-rate')])).result.current.enabled).toBe(
      true
    );
  });

  it('says so when every read was skipped, and a second press replays the toast', async () => {
    syncMoonOwnersNowRemote.mockResolvedValue({ kind: 'synced', read: 0, stale: 0, skipped: 2 });
    const { result } = renderHook(() => useMoonOwnersSyncNow([row('active')]));
    await act(() => result.current.run());
    const first = result.current.notice;
    expect(first?.message).toMatch(/scheduled sync/);
    await new Promise((r) => setTimeout(r, 2));
    await act(() => result.current.run());
    expect(result.current.notice?.instance).not.toBe(first?.instance);
  });

  it('is off for a viewer who cannot edit, and with no moon owner still read', async () => {
    canEdit = false;
    expect(renderHook(() => useMoonOwnersSyncNow([row('active')])).result.current.enabled).toBe(
      false
    );
    canEdit = true;
    const { result } = renderHook(() => useMoonOwnersSyncNow([row('left'), row('removed')]));
    expect(result.current.enabled).toBe(false);
    await act(() => result.current.run());
    expect(syncMoonOwnersNowRemote).not.toHaveBeenCalled();
  });
});
