import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MESSAGE_MS, NOTICE_MS, TOAST_MS, useTimedToast } from './useTimedToast';

describe('useTimedToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps the shared durations', () => {
    expect([TOAST_MS, NOTICE_MS, MESSAGE_MS]).toEqual([8000, 2500, 6000]);
  });

  it('expires after the default duration, not before', () => {
    const onExpire = vi.fn();
    renderHook(() => useTimedToast('saved', onExpire));
    vi.advanceTimersByTime(TOAST_MS - 1);
    expect(onExpire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('honours a custom duration', () => {
    const onExpire = vi.fn();
    renderHook(() => useTimedToast('saved', onExpire, NOTICE_MS));
    vi.advanceTimersByTime(NOTICE_MS);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('does nothing while there is no toast', () => {
    const onExpire = vi.fn();
    renderHook(() => useTimedToast(null, onExpire));
    vi.advanceTimersByTime(TOAST_MS * 2);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it('restarts the timer when the toast is replaced', () => {
    const onExpire = vi.fn();
    const { rerender } = renderHook(({ v }) => useTimedToast(v, onExpire), {
      initialProps: { v: { n: 1 } },
    });
    vi.advanceTimersByTime(TOAST_MS - 1000);
    rerender({ v: { n: 2 } });
    vi.advanceTimersByTime(TOAST_MS - 1);
    expect(onExpire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('cancels when the toast is cleared early', () => {
    const onExpire = vi.fn();
    const { rerender } = renderHook(({ v }) => useTimedToast(v, onExpire), {
      initialProps: { v: 'a' as string | null },
    });
    rerender({ v: null });
    vi.advanceTimersByTime(TOAST_MS * 2);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it('cancels on unmount', () => {
    const onExpire = vi.fn();
    const { unmount } = renderHook(() => useTimedToast('saved', onExpire));
    unmount();
    vi.advanceTimersByTime(TOAST_MS * 2);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it('calls the latest onExpire without restarting the timer', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ cb }) => useTimedToast('saved', cb), {
      initialProps: { cb: first },
    });
    vi.advanceTimersByTime(TOAST_MS - 1);
    rerender({ cb: second });
    vi.advanceTimersByTime(1);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
