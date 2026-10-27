import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const store = vi.hoisted(() => ({
  loadRequests: vi.fn(),
  loadCommunityPledges: vi.fn(),
  loadPledges: vi.fn(),
  loadBoardVersion: vi.fn(),
  loadRequestsActiveSince: vi.fn(),
  loadCommunityPledgesSince: vi.fn(),
}));
vi.mock('./requestStore', () => store);

import { useCommunityRequests } from './useCommunityRequests';

const request = { id: 'r1' };

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  // No version: these tests read the whole board each time (the cache has its own tests).
  store.loadBoardVersion.mockResolvedValue(null);
  store.loadRequests.mockResolvedValue([request]);
  store.loadCommunityPledges.mockResolvedValue(new Map());
});

describe('useCommunityRequests', () => {
  it('reads Requests and Pledges together', async () => {
    let release: () => void = () => undefined;
    store.loadCommunityPledges.mockReturnValue(new Promise((r) => (release = () => r(new Map()))));
    renderHook(() => useCommunityRequests(1, 'c1', true));
    // The Pledge read starts without waiting for the Requests to land.
    await waitFor(() => expect(store.loadCommunityPledges).toHaveBeenCalledTimes(1));
    release();
  });

  it('keeps the last board and reports failed when a reload fails after the first load', async () => {
    const { result } = renderHook(() => useCommunityRequests(1, 'c1', true));
    await waitFor(() => expect(result.current.requests).toEqual([request]));
    expect(result.current.failed).toBe(false);
    store.loadRequests.mockRejectedValue(new Error('offline'));
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.requests).toEqual([request]);
    store.loadRequests.mockResolvedValue([request]);
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.failed).toBe(false));
  });

  it('keeps the Pledges already shown when a reload fails to read them', async () => {
    const pledge = { uid: 'char:2', lines: {}, updatedAt: 1 };
    store.loadCommunityPledges.mockResolvedValue(new Map([['r1', [pledge]]]));
    const { result } = renderHook(() => useCommunityRequests(1, 'c1', true));
    await waitFor(() => expect(result.current.pledges.get('r1')).toEqual([pledge]));
    store.loadCommunityPledges.mockRejectedValue(new Error('offline'));
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.pledgesFailed).toBe(true));
    expect(result.current.pledges.get('r1')).toEqual([pledge]);
  });
});
