import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { isOnline, onReconnect, useOnline, useReconnectCount } from './network';

function setNavigatorOnline(value: boolean): void {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value });
}

function go(value: boolean): void {
  setNavigatorOnline(value);
  window.dispatchEvent(new Event(value ? 'online' : 'offline'));
}

/** Unsubscribes collected by a test, run after it so a failure cannot leak a listener. */
const cleanups: Array<() => void> = [];
function track(off: () => void): () => void {
  cleanups.push(off);
  return off;
}

afterEach(() => {
  for (const off of cleanups.splice(0)) off();
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
    track(onReconnect(cb));

    go(false);
    expect(cb).not.toHaveBeenCalled();

    go(true);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('stops firing once unsubscribed', () => {
    const cb = vi.fn();
    const off = track(onReconnect(cb));
    off();

    go(true);
    expect(cb).not.toHaveBeenCalled();
  });

  it('keeps notifying the others when one callback throws', () => {
    const bad = vi.fn(() => {
      throw new Error('boom');
    });
    const good = vi.fn();
    track(onReconnect(bad));
    track(onReconnect(good));

    go(true);
    expect(good).toHaveBeenCalledTimes(1);
  });

  it('does not skip a neighbour when a callback unsubscribes itself while being notified', () => {
    const second = vi.fn();
    const offFirst = track(
      onReconnect(() => {
        offFirst();
      })
    );
    track(onReconnect(second));

    go(true);

    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe('useOnline subscription', () => {
  it('stops listening on unmount', () => {
    setNavigatorOnline(true);
    let renders = 0;
    const { unmount } = renderHook(() => {
      renders += 1;
      return useOnline();
    });
    const rendersWhileMounted = renders;

    unmount();
    go(false);

    expect(renders).toBe(rendersWhileMounted);
  });
});

describe('useReconnectCount', () => {
  it('bumps on each reconnect and not on going offline', () => {
    setNavigatorOnline(true);
    const { result } = renderHook(() => useReconnectCount());
    expect(result.current).toBe(0);

    act(() => go(false));
    expect(result.current).toBe(0);

    act(() => go(true));
    expect(result.current).toBe(1);
  });
});
