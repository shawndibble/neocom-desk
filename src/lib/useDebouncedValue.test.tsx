import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebouncedValue, SEARCH_DEBOUNCE_MS } from './useDebouncedValue';

describe('useDebouncedValue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the initial value synchronously', () => {
    const { result } = renderHook(() => useDebouncedValue('abc'));
    expect(result.current[0]).toBe('abc');
  });

  it('holds the old value until the delay elapses', () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v), {
      initialProps: { v: 'a' },
    });
    rerender({ v: 'b' });
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1));
    expect(result.current[0]).toBe('a');
    act(() => vi.advanceTimersByTime(1));
    expect(result.current[0]).toBe('b');
  });

  it('restarts the timer on each change so only the last value lands', () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v), {
      initialProps: { v: 'a' },
    });
    rerender({ v: 'b' });
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1));
    rerender({ v: 'c' });
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1));
    expect(result.current[0]).toBe('a');
    act(() => vi.advanceTimersByTime(1));
    expect(result.current[0]).toBe('c');
  });

  it('honours a custom delay', () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 50), {
      initialProps: { v: 'a' },
    });
    rerender({ v: 'b' });
    act(() => vi.advanceTimersByTime(50));
    expect(result.current[0]).toBe('b');
  });

  it('flush jumps the debounced value immediately', () => {
    const { result } = renderHook(() => useDebouncedValue('a'));
    act(() => result.current[1]('b'));
    expect(result.current[0]).toBe('b');
  });

  it('clears the pending timer on unmount', () => {
    const { rerender, unmount } = renderHook(({ v }) => useDebouncedValue(v), {
      initialProps: { v: 'a' },
    });
    rerender({ v: 'b' });
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
