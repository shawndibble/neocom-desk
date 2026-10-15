import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { isOnline, onReconnect, useOnline } from './network';

function setNavigatorOnline(value: boolean): void {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value });
}

function go(value: boolean): void {
  setNavigatorOnline(value);
  window.dispatchEvent(new Event(value ? 'online' : 'offline'));
}

afterEach(() => {
  // Drops the own property, leaving the environment's prototype getter.
  Reflect.deleteProperty(navigator, 'onLine');
  vi.restoreAllMocks();
});

describe('isOnline', () => {
  it('reads the browser connection state', () => {
    setNavigatorOnline(false);
    expect(isOnline()).toBe(false);
    setNavigatorOnline(true);
    expect(isOnline()).toBe(true);
  });
});

describe('useOnline', () => {
  it('follows the online and offline events', () => {
    setNavigatorOnline(true);
    const { result } = renderHook(() => useOnline());
    expect(result.current).toBe(true);

    act(() => go(false));
    expect(result.current).toBe(false);

    act(() => go(true));
    expect(result.current).toBe(true);
  });

  it('starts from the current state when mounted offline', () => {
    setNavigatorOnline(false);
    const { result } = renderHook(() => useOnline());
    expect(result.current).toBe(false);
  });
});

describe('onReconnect', () => {
  it('fires on the offline to online transition, not on going offline', () => {
    const cb = vi.fn();
    const off = onReconnect(cb);

    go(false);
    expect(cb).not.toHaveBeenCalled();

    go(true);
    expect(cb).toHaveBeenCalledTimes(1);
    off();
  });

  it('stops firing once unsubscribed', () => {
    const cb = vi.fn();
    const off = onReconnect(cb);
    off();

    go(true);
    expect(cb).not.toHaveBeenCalled();
  });

  it('keeps notifying the others when one callback throws', () => {
    const bad = vi.fn(() => {
      throw new Error('boom');
    });
    const good = vi.fn();
    const offBad = onReconnect(bad);
    const offGood = onReconnect(good);

    go(true);
    expect(good).toHaveBeenCalledTimes(1);
    offBad();
    offGood();
  });
});
