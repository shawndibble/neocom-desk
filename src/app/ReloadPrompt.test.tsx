import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { useEffect } from 'react';
import { MemoryRouter, useNavigate, type NavigateFunction } from 'react-router-dom';
import '@/i18n';
import { ReloadPrompt } from './ReloadPrompt';

const { updateServiceWorker, state, registerSWOptions } = vi.hoisted(() => ({
  updateServiceWorker: vi.fn(),
  state: { needRefresh: true },
  registerSWOptions: {
    current: undefined as
      { onRegisteredSW?: (...a: unknown[]) => void; onNeedReload?: () => void } | undefined,
  },
}));

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: (options?: {
    onRegisteredSW?: (...a: unknown[]) => void;
    onNeedReload?: () => void;
  }) => {
    registerSWOptions.current = options;
    return {
      needRefresh: [state.needRefresh, vi.fn()],
      offlineReady: [false, vi.fn()],
      updateServiceWorker,
    };
  },
}));

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, value: hidden });
  document.dispatchEvent(new Event('visibilitychange'));
}

const navigateRef: { current: NavigateFunction | null } = { current: null };

function CaptureNavigate() {
  const navigate = useNavigate();
  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);
  return null;
}

function renderPrompt() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <CaptureNavigate />
      <ReloadPrompt />
    </MemoryRouter>
  );
}

function navigateTo(path: string) {
  act(() => navigateRef.current?.(path));
}

const HIDDEN_APPLY_GRACE_MS = 30 * 1000;
const APPLY_CHECK_POLL_MS = 15 * 1000;

beforeEach(() => {
  updateServiceWorker.mockClear();
  navigateRef.current = null;
  state.needRefresh = true;
  setHidden(false);
  vi.useFakeTimers();
  // Start the fake clock well past epoch 0 — the component uses 0 as a
  // sentinel for "not hidden," which would collide with a real Date.now()
  // reading if the clock started at 0.
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  setHidden(false);
});

describe('ReloadPrompt', () => {
  it('renders nothing', () => {
    const { container } = renderPrompt();
    expect(container).toBeEmptyDOMElement();
  });

  it('does nothing when no update is waiting', async () => {
    state.needRefresh = false;
    renderPrompt();
    await vi.advanceTimersByTimeAsync(HIDDEN_APPLY_GRACE_MS);
    navigateTo('/other');
    expect(updateServiceWorker).not.toHaveBeenCalled();
  });

  it('applies the update once a hidden tab stays hidden past the grace period', async () => {
    renderPrompt();
    setHidden(true);
    expect(updateServiceWorker).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(HIDDEN_APPLY_GRACE_MS);

    expect(updateServiceWorker).toHaveBeenCalledTimes(1);
  });

  it('applies on resume when the grace period elapsed while backgrounded, even if the polling tick never ran (mobile OS freezes timers while hidden)', () => {
    renderPrompt();
    setHidden(true);
    // No vi.advanceTimersByTimeAsync here — the tick never fires, as it
    // wouldn't on a real phone that freezes JS while backgrounded. Only the
    // wall clock moves.
    vi.setSystemTime(new Date(Date.now() + HIDDEN_APPLY_GRACE_MS + 1000));
    expect(updateServiceWorker).not.toHaveBeenCalled();

    setHidden(false);

    expect(updateServiceWorker).toHaveBeenCalledTimes(1);
  });

  it('does not apply if the tab becomes visible again before the grace period elapses', async () => {
    renderPrompt();
    setHidden(true);
    await vi.advanceTimersByTimeAsync(HIDDEN_APPLY_GRACE_MS / 2);
    setHidden(false);

    await vi.advanceTimersByTimeAsync(HIDDEN_APPLY_GRACE_MS);

    expect(updateServiceWorker).not.toHaveBeenCalled();
  });

  it('applies the update on the next in-app route change while the tab stays visible', () => {
    renderPrompt();

    navigateTo('/other');

    expect(updateServiceWorker).toHaveBeenCalledTimes(1);
  });

  it('does not apply just because the app mounted on some route', () => {
    renderPrompt();
    expect(updateServiceWorker).not.toHaveBeenCalled();
  });

  it('never applies while a visible tab stays on the same route, no matter how long it sits idle', async () => {
    renderPrompt();
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(updateServiceWorker).not.toHaveBeenCalled();
  });

  it('retries on the next tick if a hidden-tab apply did not cause the page to unload', async () => {
    renderPrompt();
    setHidden(true);
    await vi.advanceTimersByTimeAsync(HIDDEN_APPLY_GRACE_MS);
    expect(updateServiceWorker).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(APPLY_CHECK_POLL_MS);

    expect(updateServiceWorker).toHaveBeenCalledTimes(2);
  });

  it('treats a manual reload as consent to apply an update that is waiting', () => {
    renderPrompt();
    expect(updateServiceWorker).not.toHaveBeenCalled();

    window.dispatchEvent(new Event('beforeunload'));

    expect(updateServiceWorker).toHaveBeenCalledTimes(1);
  });

  it('does not call updateServiceWorker on unload when no update is waiting', () => {
    state.needRefresh = false;
    renderPrompt();

    window.dispatchEvent(new Event('beforeunload'));

    expect(updateServiceWorker).not.toHaveBeenCalled();
  });

  it('covers the viewport with the app background before reloading, instead of reloading instantly', async () => {
    const reloadSpy = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload: reloadSpy });
    renderPrompt();

    registerSWOptions.current?.onNeedReload?.();

    expect(document.querySelector('[data-pwa-update-overlay]')).not.toBeNull();
    expect(reloadSpy).not.toHaveBeenCalled();

    await vi.waitFor(() => expect(reloadSpy).toHaveBeenCalledTimes(1));
    vi.unstubAllGlobals();
  });

  describe('boot apply', () => {
    const BOOT_APPLY_WINDOW_MS = 60 * 1000;
    let view: ReturnType<typeof renderPrompt>;

    beforeEach(() => {
      state.needRefresh = false;
      view = renderPrompt();
    });

    function updateFound() {
      state.needRefresh = true;
      view.rerender(
        <MemoryRouter initialEntries={['/']}>
          <CaptureNavigate />
          <ReloadPrompt />
        </MemoryRouter>
      );
    }

    it('applies an update found right after the app loads, without a route change', () => {
      updateFound();
      expect(updateServiceWorker).toHaveBeenCalledTimes(1);
    });

    it('leaves an update found after the boot window to the route-change rule', async () => {
      await vi.advanceTimersByTimeAsync(BOOT_APPLY_WINDOW_MS + 1000);
      updateFound();
      expect(updateServiceWorker).not.toHaveBeenCalled();
    });
  });

  describe('periodic update check', () => {
    const THIRTY_MINUTES_MS = 30 * 60 * 1000;

    function fireOnRegistered(registration: {
      installing: ServiceWorker | null;
      update: () => Promise<void>;
    }) {
      registerSWOptions.current?.onRegisteredSW?.('sw.js', registration);
    }

    function setup(
      registration = { installing: null, update: vi.fn().mockResolvedValue(undefined) }
    ) {
      renderPrompt();
      fireOnRegistered(registration);
      return registration;
    }

    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('checks for an update without downloading sw.js a second time itself', async () => {
      const { update } = setup();

      await vi.advanceTimersByTimeAsync(THIRTY_MINUTES_MS);

      // registration.update() already fetches sw.js past the HTTP cache; a
      // pre-fetch of our own made every check download it twice.
      expect(fetch).not.toHaveBeenCalled();
      expect(update).toHaveBeenCalledTimes(1);
    });

    it('skips the check while offline', async () => {
      vi.stubGlobal('navigator', { ...navigator, onLine: false });
      const { update } = setup();

      await vi.advanceTimersByTimeAsync(THIRTY_MINUTES_MS);

      expect(fetch).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    });

    it('survives a failed update check and still checks again next tick', async () => {
      const registration = {
        installing: null,
        update: vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined),
      };
      setup(registration);

      await vi.advanceTimersByTimeAsync(THIRTY_MINUTES_MS);
      expect(registration.update).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(THIRTY_MINUTES_MS);
      expect(registration.update).toHaveBeenCalledTimes(2);
    });

    it('starts only one interval when StrictMode double-invokes registration for the same registration', async () => {
      const registration = setup();
      fireOnRegistered(registration);

      await vi.advanceTimersByTimeAsync(THIRTY_MINUTES_MS);

      expect(registration.update).toHaveBeenCalledTimes(1);
    });
  });
});
