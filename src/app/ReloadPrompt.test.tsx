import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { useEffect } from 'react';
import { MemoryRouter, useNavigate, type NavigateFunction } from 'react-router-dom';
import '@/i18n';
import { watchRegistration } from './updateAvailable';
import { ReloadPrompt } from './ReloadPrompt';

const { existingWorker } = vi.hoisted(() => ({
  existingWorker: { current: undefined as unknown },
}));
vi.mock('./updateAvailable', () => ({ watchRegistration: vi.fn() }));
vi.mock('@/lib/serviceWorker', () => ({
  getServiceWorkerRegistration: () => Promise.resolve(existingWorker.current),
}));

const { updateServiceWorker, state, registerSWOptions } = vi.hoisted(() => ({
  updateServiceWorker: vi.fn(),
  state: { needRefresh: true },
  registerSWOptions: {
    current: undefined as
      | {
          onRegisteredSW?: (...a: unknown[]) => void;
        }
      | undefined,
  },
}));

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: (options?: { onRegisteredSW?: (...a: unknown[]) => void }) => {
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

function renderPrompt(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <CaptureNavigate />
      <ReloadPrompt />
    </MemoryRouter>
  );
}

function navigateTo(path: string) {
  act(() => navigateRef.current?.(path));
}

const HIDDEN_FOR_MS = 10 * 60 * 1000;

beforeEach(() => {
  updateServiceWorker.mockClear();
  navigateRef.current = null;
  existingWorker.current = undefined;
  registerSWOptions.current = undefined;
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
    await vi.advanceTimersByTimeAsync(HIDDEN_FOR_MS);
    navigateTo('/other');
    expect(updateServiceWorker).not.toHaveBeenCalled();
  });

  it('never applies an update because the tab was hidden, however long, even on coming back', async () => {
    renderPrompt();
    setHidden(true);
    await vi.advanceTimersByTimeAsync(HIDDEN_FOR_MS);
    setHidden(false);
    await vi.advanceTimersByTimeAsync(HIDDEN_FOR_MS);

    expect(updateServiceWorker).not.toHaveBeenCalled();
  });

  it('never applies an update on a route change, even with one waiting', () => {
    renderPrompt();

    navigateTo('/other');
    navigateTo('/another');

    expect(updateServiceWorker).not.toHaveBeenCalled();
  });

  it('never applies on a manual reload or on mount', () => {
    renderPrompt();
    window.dispatchEvent(new Event('beforeunload'));
    expect(updateServiceWorker).not.toHaveBeenCalled();
  });

  it('never applies while a visible tab stays on the same route, no matter how long it sits idle', async () => {
    renderPrompt();
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(updateServiceWorker).not.toHaveBeenCalled();
  });

  describe('on a public link route', () => {
    it('does not register a worker for a visitor who has none', async () => {
      renderPrompt('/s/5gqdkt');
      await act(() => vi.advanceTimersByTimeAsync(0));
      expect(registerSWOptions.current).toBeUndefined();
    });

    it('registers when a worker already exists', async () => {
      existingWorker.current = {};
      renderPrompt('/s/5gqdkt');
      await act(() => vi.advanceTimersByTimeAsync(0));
      expect(registerSWOptions.current).toBeDefined();
    });

    it('registers once the visitor goes into the app, and stays registered after', async () => {
      renderPrompt('/s/5gqdkt');
      await act(() => vi.advanceTimersByTimeAsync(0));
      expect(registerSWOptions.current).toBeUndefined();

      navigateTo('/survey');
      expect(registerSWOptions.current).toBeDefined();

      registerSWOptions.current = undefined;
      navigateTo('/s/other');
      expect(registerSWOptions.current).toBeDefined();
    });
  });

  describe('periodic update check', () => {
    const CHECK_INTERVAL_MS = 5 * 60 * 1000;

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

      await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);

      // registration.update() already fetches sw.js past the HTTP cache; a
      // pre-fetch of our own made every check download it twice.
      expect(fetch).not.toHaveBeenCalled();
      expect(update).toHaveBeenCalledTimes(1);
    });

    it('checks when the tab comes back, at most once a minute', async () => {
      const { update } = setup();
      setHidden(true);
      await vi.advanceTimersByTimeAsync(61 * 1000);
      setHidden(false);
      await vi.advanceTimersByTimeAsync(0);
      expect(update).toHaveBeenCalledTimes(1);

      setHidden(true);
      setHidden(false);
      await vi.advanceTimersByTimeAsync(0);
      expect(update).toHaveBeenCalledTimes(1);
    });

    it('skips the check while offline', async () => {
      vi.stubGlobal('navigator', { ...navigator, onLine: false });
      const { update } = setup();

      await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);

      expect(fetch).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    });

    it('hands the registration to the update-state watcher', () => {
      const registration = setup();
      expect(watchRegistration).toHaveBeenCalledWith(registration);
    });

    it('survives a failed update check and still checks again next tick', async () => {
      const registration = {
        installing: null,
        update: vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined),
      };
      setup(registration);

      await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
      expect(registration.update).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
      expect(registration.update).toHaveBeenCalledTimes(2);
    });

    it('starts only one interval when StrictMode double-invokes registration for the same registration', async () => {
      const registration = setup();
      fireOnRegistered(registration);

      await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);

      expect(registration.update).toHaveBeenCalledTimes(1);
    });
  });
});
