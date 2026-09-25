// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forceUpdate } from './forceUpdate';

const reload = vi.fn();

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
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
    vi.stubGlobal('location', { ...window.location, reload });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    reload.mockReset();
  });

  it('reloads when there is no service worker registration', async () => {
    stubServiceWorker(undefined);
    await forceUpdate();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('checks for an update and reloads without skip-waiting when already current', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    stubServiceWorker({ update, active: { scriptURL: '/sw.js' }, waiting: null });
    await forceUpdate();
    expect(update).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('activates a waiting worker and reloads once it takes control', async () => {
    const postMessage = vi.fn();
    const registration = {
      update: vi.fn().mockResolvedValue(undefined),
      active: { scriptURL: '/sw.js' },
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

  it('still reloads when the update check throws', async () => {
    stubServiceWorker({ update: vi.fn().mockRejectedValue(new Error('offline')), active: null });
    await forceUpdate();
    expect(reload).toHaveBeenCalledOnce();
  });
});
