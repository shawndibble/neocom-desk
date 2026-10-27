import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMasteries } from './useMasteries';

const loadMasteries = vi.hoisted(() => vi.fn());
vi.mock('@/sde/loadSde', () => ({ loadMasteries }));

describe('useMasteries', () => {
  beforeEach(() => loadMasteries.mockReset());

  it('is loading, then loaded', async () => {
    loadMasteries.mockResolvedValue({ 1: [] });
    const { result } = renderHook(() => useMasteries());
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('loaded'));
  });

  it('stays unavailable, retrying, until a retry settles', async () => {
    loadMasteries.mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useMasteries());
    await waitFor(() => expect(result.current.status).toBe('unavailable'));
    expect(result.current.retrying).toBe(false);

    let resolve!: (value: object) => void;
    loadMasteries.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.retrying).toBe(true));
    expect(result.current.status).toBe('unavailable');

    await act(async () => resolve({}));
    await waitFor(() => expect(result.current.status).toBe('loaded'));
    expect(result.current.retrying).toBe(false);
  });
});
