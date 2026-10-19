import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useRetryOnReconnect } from './useRetryOnReconnect';

const reconnect = () =>
  act(() => {
    window.dispatchEvent(new Event('online'));
  });

describe('useRetryOnReconnect', () => {
  it('retries when the connection returns while failed', () => {
    const retry = vi.fn();
    renderHook(() => useRetryOnReconnect(true, retry));
    reconnect();
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('does nothing while not failed', () => {
    const retry = vi.fn();
    renderHook(() => useRetryOnReconnect(false, retry));
    reconnect();
    expect(retry).not.toHaveBeenCalled();
  });

  it('stops listening once the failure clears', () => {
    const retry = vi.fn();
    const { rerender } = renderHook(({ failed }) => useRetryOnReconnect(failed, retry), {
      initialProps: { failed: true },
    });
    rerender({ failed: false });
    reconnect();
    expect(retry).not.toHaveBeenCalled();
  });
});
