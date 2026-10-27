// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forceUpdate } from './forceUpdate';
import { hideBootCover, useBootCover } from './bootCover';
import { renderHook } from '@testing-library/react';

const { fetchLatestRelease } = vi.hoisted(() => ({
  fetchLatestRelease: vi.fn<() => Promise<string | null>>(),
}));
vi.mock('./latestRelease', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./latestRelease')>()),
  fetchLatestRelease,
}));

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
      removeEventListener: vi.fn(),
    },
  });
  return listeners;
}

describe('forceUpdate', () => {
  beforeEach(() => {
    vi.stubGlobal('location', { ...window.location, reload });
    fetchLatestRelease.mockResolvedValue(null);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    reload.mockReset();
    hideBootCover();
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

  it('reports pending, without reloading, when a newer release is published but no new worker came', async () => {
    const { result } = renderHook(() => useBootCover());
    fetchLatestRelease.mockResolvedValue('neocom-desk@0.1.0+newer');
    stubServiceWorker({
      update: vi.fn().mockResolvedValue(undefined),
      waiting: null,
      installing: null,
    });
    await expect(forceUpdate()).resolves.toBe('pending');
    expect(reload).not.toHaveBeenCalled();
    expect(result.current).toBe(false);
  });

  it('reports pending, not failed, when a slow install uses up the install wait', async () => {
    vi.useFakeTimers();
    fetchLatestRelease.mockResolvedValue('neocom-desk@0.1.0+newer');
    stubServiceWorker({
      update: vi.fn(() => new Promise<void>((r) => setTimeout(r, 12_000))),
      installing: { state: 'installing', addEventListener: vi.fn() },
      waiting: null,
    });
    const done = forceUpdate();
    await vi.advanceTimersByTimeAsync(33_000);
    await expect(done).resolves.toBe('pending');
  });

  it('reloads when no new worker came and the published release is the running one', async () => {
    fetchLatestRelease.mockResolvedValue(__APP_RELEASE__);
    stubServiceWorker({
      update: vi.fn().mockResolvedValue(undefined),
      waiting: null,
      installing: null,
    });
    await forceUpdate();
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

  it('covers the page with the boot screen while swapping, and keeps it up for the reload', async () => {
    const { result } = renderHook(() => useBootCover());
    stubServiceWorker(undefined);
    await forceUpdate();
    expect(result.current).toBe(true);
  });

  it('gives up and takes the cover down when the check never settles', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useBootCover());
    stubServiceWorker({ update: vi.fn(() => new Promise<void>(() => {})), installing: null });
    const done = forceUpdate();
    await vi.advanceTimersByTimeAsync(35_000);
    await expect(done).resolves.toBe('failed');
    expect(reload).not.toHaveBeenCalled();
    expect(result.current).toBe(false);
  });

  it('takes the cover down again when the check fails', async () => {
    const { result } = renderHook(() => useBootCover());
    stubServiceWorker({
      update: vi.fn().mockRejectedValue(new Error('offline')),
      installing: null,
    });
    await forceUpdate();
    expect(result.current).toBe(false);
  });
});
