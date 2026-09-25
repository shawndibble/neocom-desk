// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forceUpdate } from './forceUpdate';

const reload = vi.fn();
const realServiceWorker = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');

function stubServiceWorker(registration: unknown) {
  const listeners: Record<string, () => void> = {};
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      getRegistration: vi.fn().mockResolvedValue(registration),
      addEventListener: (type: string, fn: () => void) => {
        listeners[type] = fn;
      },
    },
  });
  return listeners;
}

describe('forceUpdate', () => {
  beforeEach(() => {
    vi.stubGlobal('location', { ...window.location, reload });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    reload.mockReset();
    if (realServiceWorker) Object.defineProperty(navigator, 'serviceWorker', realServiceWorker);
    else Reflect.deleteProperty(navigator, 'serviceWorker');
  });

  it('reloads when there is no service worker registration', async () => {
    stubServiceWorker(undefined);
    await forceUpdate();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('checks for an update and reloads without skip-waiting when already current', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    stubServiceWorker({ update, waiting: null, installing: null });
    await forceUpdate();
    expect(update).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('activates a waiting worker and reloads once it takes control', async () => {
    const postMessage = vi.fn();
    const registration = {
      update: vi.fn().mockResolvedValue(undefined),
      installing: null,
      waiting: { postMessage },
    };
    const listeners = stubServiceWorker(registration);
    const done = forceUpdate();
    await vi.waitFor(() => expect(postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' }));
    expect(reload).not.toHaveBeenCalled();
    listeners.controllerchange();
    await done;
    expect(reload).toHaveBeenCalledOnce();
  });

  it('reloads anyway when the new worker never takes control', async () => {
    vi.useFakeTimers();
    const registration = {
      update: vi.fn().mockResolvedValue(undefined),
      installing: null,
      waiting: { postMessage: vi.fn() },
    };
    stubServiceWorker(registration);
    const done = forceUpdate();
    await vi.advanceTimersByTimeAsync(4000);
    await done;
    expect(reload).toHaveBeenCalledOnce();
  });

  it('waits for an installing worker before activating it', async () => {
    const postMessage = vi.fn();
    const installing = { state: 'installing', addEventListener: vi.fn() };
    const registration: Record<string, unknown> = {
      update: vi.fn().mockResolvedValue(undefined),
      installing,
      waiting: null,
    };
    const listeners = stubServiceWorker(registration);
    const done = forceUpdate();
    await vi.waitFor(() => expect(installing.addEventListener).toHaveBeenCalled());
    expect(postMessage).not.toHaveBeenCalled();
    registration.waiting = { postMessage };
    installing.state = 'installed';
    installing.addEventListener.mock.calls[0][1]();
    await vi.waitFor(() => expect(postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' }));
    listeners.controllerchange();
    await done;
    expect(reload).toHaveBeenCalledOnce();
  });

  it('gives up on an install that never finishes and reloads', async () => {
    vi.useFakeTimers();
    stubServiceWorker({
      update: vi.fn().mockResolvedValue(undefined),
      installing: { state: 'installing', addEventListener: vi.fn() },
      waiting: null,
    });
    const done = forceUpdate();
    await vi.advanceTimersByTimeAsync(20000);
    await done;
    expect(reload).toHaveBeenCalledOnce();
  });

  it('reports failed and does not reload when the update check throws', async () => {
    stubServiceWorker({
      update: vi.fn().mockRejectedValue(new Error('offline')),
      installing: null,
    });
    await expect(forceUpdate()).resolves.toBe('failed');
    expect(reload).not.toHaveBeenCalled();
  });
});
