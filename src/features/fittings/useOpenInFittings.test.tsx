import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useOpenInFittings } from './useOpenInFittings';
import { deferred } from '@/test/deferred';

const navigateMock = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigateMock,
}));

const LOCATION = { pathname: '/fittings/edit', search: '?f=2.x' };

beforeEach(() => navigateMock.mockReset());

describe('useOpenInFittings', () => {
  it('opens the Fitting once, however often it is asked while the rolls load', async () => {
    const { result } = renderHook(() => useOpenInFittings());
    const pending = deferred<typeof LOCATION | null>();
    const load = vi.fn(() => pending.promise);

    act(() => result.current.open(load));
    expect(result.current.pending).toBe(true);
    act(() => result.current.open(load));
    await act(async () => pending.resolve(LOCATION));
    expect(result.current.pending).toBe(false);

    expect(load).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith(LOCATION);
  });

  it('stays put when the page was left before the Fitting was ready', async () => {
    const { result, unmount } = renderHook(() => useOpenInFittings());
    const pending = deferred<typeof LOCATION | null>();

    act(() => result.current.open(() => pending.promise));
    unmount();
    await act(async () => pending.resolve(LOCATION));

    expect(navigateMock).not.toHaveBeenCalled();
  });
});
