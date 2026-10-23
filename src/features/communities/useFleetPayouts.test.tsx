import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const store = vi.hoisted(() => ({ loadFleetPayouts: vi.fn() }));
vi.mock('./fleetPayoutStore', () => store);

import { useFleetPayouts } from './useFleetPayouts';

const payout = { id: 'p1' };

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  store.loadFleetPayouts.mockResolvedValue([payout]);
});

describe('useFleetPayouts', () => {
  it('reads nothing until enabled', async () => {
    const { result, rerender } = renderHook(({ on }) => useFleetPayouts(1, 'c1', on), {
      initialProps: { on: false },
    });
    expect(store.loadFleetPayouts).not.toHaveBeenCalled();
    expect(result.current.payouts).toBeNull();
    rerender({ on: true });
    await waitFor(() => expect(result.current.payouts).toEqual([payout]));
  });

  it('keeps the last list and reports failed when a reload fails', async () => {
    const { result } = renderHook(() => useFleetPayouts(1, 'c1', true));
    await waitFor(() => expect(result.current.payouts).toEqual([payout]));
    store.loadFleetPayouts.mockRejectedValue(new Error('offline'));
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.payouts).toEqual([payout]);
    store.loadFleetPayouts.mockResolvedValue([payout]);
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.failed).toBe(false));
  });
});
