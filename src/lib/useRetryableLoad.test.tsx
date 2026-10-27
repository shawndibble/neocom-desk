import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useRetryableLoad } from './useRetryableLoad';

describe('useRetryableLoad', () => {
  it('counts a retry and clears the failure', () => {
    const { result } = renderHook(() => useRetryableLoad());
    act(() => result.current.fail());
    expect(result.current.failed).toBe(true);
    act(() => result.current.retry());
    expect(result.current.failed).toBe(false);
    expect(result.current.attempt).toBe(1);
  });

  it('retries by itself on reconnect while failed, and not otherwise', () => {
    const { result } = renderHook(() => useRetryableLoad());
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current.attempt).toBe(0);
    act(() => result.current.fail());
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current.attempt).toBe(1);
    expect(result.current.failed).toBe(false);
  });

  it('stops listening once cleared', () => {
    const { result } = renderHook(() => useRetryableLoad());
    act(() => result.current.fail());
    act(() => result.current.clear());
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current.attempt).toBe(0);
  });
});
