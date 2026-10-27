import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCopyFeedback } from './useCopyFeedback';

describe('useCopyFeedback', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('starts idle, flashes true, then clears after the delay', () => {
    const { result } = renderHook(() => useCopyFeedback(2000));
    expect(result.current.copied).toBeNull();
    act(() => result.current.flash());
    expect(result.current.copied).toBe(true);
    act(() => void vi.advanceTimersByTime(1999));
    expect(result.current.copied).toBe(true);
    act(() => void vi.advanceTimersByTime(1));
    expect(result.current.copied).toBeNull();
  });

  it('a new flash replaces the value and restarts the timer', () => {
    const { result } = renderHook(() => useCopyFeedback<string>(1000));
    act(() => result.current.flash('a'));
    act(() => void vi.advanceTimersByTime(800));
    act(() => result.current.flash('b'));
    act(() => void vi.advanceTimersByTime(800));
    expect(result.current.copied).toBe('b');
    act(() => void vi.advanceTimersByTime(200));
    expect(result.current.copied).toBeNull();
  });

  it('clear drops the flash and cancels the pending timer', () => {
    const { result } = renderHook(() => useCopyFeedback(1000));
    act(() => result.current.flash());
    act(() => result.current.clear());
    expect(result.current.copied).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels the pending timer on unmount', () => {
    const { result, unmount } = renderHook(() => useCopyFeedback(1000));
    act(() => result.current.flash());
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
