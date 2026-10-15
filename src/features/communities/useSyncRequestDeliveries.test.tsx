import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  hasScope: vi.fn(),
  sync: vi.fn(),
  listIds: vi.fn(),
  inFlight: vi.fn(),
}));
vi.mock('@/app/syncStatus', () => ({ isSyncConfigured: () => true }));
vi.mock('./requestDelivery', () => ({
  hasDeliveryScope: mocks.hasScope,
  syncRequestDeliveries: mocks.sync,
}));
vi.mock('./communityStore', () => ({ listCommunityIds: mocks.listIds }));
vi.mock('./pledgeWrites', () => ({ pledgeWritesInFlight: mocks.inFlight }));

import { DELIVERY_BOOT_DELAY_MS, useSyncRequestDeliveries } from './useSyncRequestDeliveries';

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  mocks.hasScope.mockResolvedValue(true);
  mocks.listIds.mockResolvedValue(['c1']);
  mocks.sync.mockResolvedValue({ status: 'ok', updated: 0, flags: new Map() });
  mocks.inFlight.mockReturnValue(0);
});
afterEach(() => vi.useRealTimers());

const bootSweep = () => vi.advanceTimersByTimeAsync(DELIVERY_BOOT_DELAY_MS + 10);

describe('useSyncRequestDeliveries', () => {
  it('sweeps every Character after boot, the active one last', async () => {
    renderHook(() => useSyncRequestDeliveries([1, 2], 1));
    await bootSweep();
    expect(mocks.sync.mock.calls.map((c) => c[0])).toEqual([2, 1]);
  });

  it('cancels the pending sweep when the Character list changes, and runs the new one', async () => {
    const { rerender } = renderHook(
      ({ ids }: { ids: number[] }) => useSyncRequestDeliveries(ids, 1),
      { initialProps: { ids: [1] } }
    );
    await vi.advanceTimersByTimeAsync(DELIVERY_BOOT_DELAY_MS - 1000);
    rerender({ ids: [1, 3] });
    await vi.advanceTimersByTimeAsync(2000);
    // The old timer is gone: nothing ran yet.
    expect(mocks.sync).not.toHaveBeenCalled();
    await bootSweep();
    expect(mocks.sync.mock.calls.map((c) => c[0])).toEqual([3, 1]);
  });

  it('stops when unmounted', async () => {
    const { unmount } = renderHook(() => useSyncRequestDeliveries([1], 1));
    unmount();
    await bootSweep();
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it('leaves the other Characters for the next run while a Pledge is being saved', async () => {
    mocks.inFlight.mockReturnValue(1);
    renderHook(() => useSyncRequestDeliveries([1, 2], 1));
    await bootSweep();
    // The active Character's session is the one in use: it is safe, the other would swap it.
    expect(mocks.sync.mock.calls.map((c) => c[0])).toEqual([1]);
  });
});
