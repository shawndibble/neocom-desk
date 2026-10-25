import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  publish: vi.fn(),
  plans: vi.fn(),
  has: vi.fn(),
  leader: true,
}));
vi.mock('@/app/syncStatus', () => ({ isSyncConfigured: () => true }));
vi.mock('@/lib/tabLeader', () => ({
  joinTabElection: () => ({ isLeader: () => mocks.leader, leave: () => undefined }),
}));
vi.mock('./shareSelection', () => ({ hasShareSelections: mocks.has }));
vi.mock('./libraryPush', () => ({ publishAllSharedLibraries: mocks.publish }));
vi.mock('./sharedPlans', () => ({ syncAllSharedPlans: mocks.plans }));

import { PUBLISH_BOOT_DELAY_MS, usePublishSharedLibraries } from './usePublishSharedLibraries';

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  mocks.has.mockResolvedValue(true);
  mocks.leader = true;
});
afterEach(() => vi.useRealTimers());

const bootSweep = () => vi.advanceTimersByTimeAsync(PUBLISH_BOOT_DELAY_MS + 10);

describe('usePublishSharedLibraries', () => {
  it('publishes for each sharing Character in the leader tab', async () => {
    renderHook(() => usePublishSharedLibraries([1, 2], 1));
    await bootSweep();
    expect(mocks.publish.mock.calls.map((c) => c[0])).toEqual([2, 1]);
  });

  it('does not sweep in a tab that is not the leader', async () => {
    mocks.leader = false;
    renderHook(() => usePublishSharedLibraries([1, 2], 1));
    await bootSweep();
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it('does not sweep in a hidden tab', async () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    renderHook(() => usePublishSharedLibraries([1, 2], 1));
    await bootSweep();
    visibility.mockRestore();
    expect(mocks.publish).not.toHaveBeenCalled();
  });
});
