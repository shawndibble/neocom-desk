import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAutoDismiss } from './useAutoDismiss';

describe('useAutoDismiss', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sets the value immediately, then clears it to offValue after the default duration', () => {
    const setValue = vi.fn();
    const { result } = renderHook(() => useAutoDismiss<string | null>(setValue, null));

    act(() => result.current.show('saved'));
    expect(setValue).toHaveBeenCalledWith('saved');

    act(() => vi.advanceTimersByTime(1999));
    expect(setValue).not.toHaveBeenCalledWith(null);

    act(() => vi.advanceTimersByTime(1));
    expect(setValue).toHaveBeenCalledWith(null);
  });

  it('clears to a non-null offValue, for boolean-flag confirms', () => {
    const setValue = vi.fn();
    const { result } = renderHook(() => useAutoDismiss<boolean>(setValue, false));

    act(() => result.current.show(true));
    expect(setValue).toHaveBeenCalledWith(true);
    act(() => vi.advanceTimersByTime(2000));
    expect(setValue).toHaveBeenLastCalledWith(false);
  });

  it('accepts a per-call duration override', () => {
    const setValue = vi.fn();
    const { result } = renderHook(() => useAutoDismiss<string | null>(setValue, null));

    act(() => result.current.show('saved', 4000));
    act(() => vi.advanceTimersByTime(2000));
    expect(setValue).not.toHaveBeenCalledWith(null);
    act(() => vi.advanceTimersByTime(2000));
    expect(setValue).toHaveBeenCalledWith(null);
  });

  it('cancels a pending clear when shown again before it fires (#1402: supersede, don’t race)', () => {
    const setValue = vi.fn();
    const { result } = renderHook(() => useAutoDismiss<string | null>(setValue, null));

    act(() => result.current.show('first'));
    act(() => vi.advanceTimersByTime(1000));
    act(() => result.current.show('second'));
    // The first call's timer would have fired at 2000ms; it must not clear
    // the second call's value early.
    act(() => vi.advanceTimersByTime(1000));
    expect(setValue).not.toHaveBeenCalledWith(null);

    act(() => vi.advanceTimersByTime(1000));
    expect(setValue).toHaveBeenCalledWith(null);
    expect(setValue).toHaveBeenCalledTimes(3); // first, second, null
  });

  it('cancel() clears a pending dismiss without setting offValue (the import-Undo case)', () => {
    const setValue = vi.fn();
    const { result } = renderHook(() => useAutoDismiss<string | null>(setValue, null));

    act(() => result.current.show('replaced', 10000));
    act(() => result.current.cancel());
    setValue.mockClear();

    act(() => vi.advanceTimersByTime(10000));
    expect(setValue).not.toHaveBeenCalled();
  });

  it('cancel() is a no-op when nothing is pending', () => {
    const setValue = vi.fn();
    const { result } = renderHook(() => useAutoDismiss<string | null>(setValue, null));

    expect(() => act(() => result.current.cancel())).not.toThrow();
    expect(setValue).not.toHaveBeenCalled();
  });

  it('clears its pending timeout on unmount, never calling setValue afterward', () => {
    const setValue = vi.fn();
    const { result, unmount } = renderHook(() => useAutoDismiss<string | null>(setValue, null));

    act(() => result.current.show('saved'));
    unmount();
    setValue.mockClear();

    act(() => vi.advanceTimersByTime(5000));
    expect(setValue).not.toHaveBeenCalled();
  });
});
