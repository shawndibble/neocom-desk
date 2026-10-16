import { describe, expect, it, vi } from 'vitest';
import { IDLE_TIMEOUT_MS, waitForIdle, type IdleHost } from './analyticsIdle';

function fakeHost(readyState: string) {
  const loadListeners: Array<() => void> = [];
  const idleCallbacks: Array<() => void> = [];
  const host: IdleHost = {
    readyState,
    addLoadListener: (l) => loadListeners.push(l),
    requestIdle: vi.fn((cb: () => void) => idleCallbacks.push(cb)),
  };
  return { host, loadListeners, idleCallbacks };
}

describe('waitForIdle', () => {
  it('resolves immediately when there is no DOM', async () => {
    await expect(waitForIdle(undefined)).resolves.toBeUndefined();
  });

  it('holds until load, then until idle, queueing every waiter on one promise', async () => {
    const { host, loadListeners, idleCallbacks } = fakeHost('loading');
    const settled = vi.fn();
    const ready = waitForIdle(host);
    void ready.then(settled);
    void ready.then(settled);

    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    expect(host.requestIdle).not.toHaveBeenCalled();

    loadListeners[0]();
    expect(host.requestIdle).toHaveBeenCalledWith(expect.any(Function), IDLE_TIMEOUT_MS);
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();

    idleCallbacks[0]();
    await ready;
    await Promise.resolve();
    expect(settled).toHaveBeenCalledTimes(2);
  });

  it('skips the load wait when the page already loaded', async () => {
    const { host, loadListeners, idleCallbacks } = fakeHost('complete');
    const ready = waitForIdle(host);
    expect(loadListeners).toHaveLength(0);
    idleCallbacks[0]();
    await expect(ready).resolves.toBeUndefined();
  });
});
