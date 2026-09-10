import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import '@/i18n';
import { ReloadPrompt } from './ReloadPrompt';

const { updateServiceWorker, state, registerSWOptions } = vi.hoisted(() => ({
  updateServiceWorker: vi.fn(),
  state: { needRefresh: true },
  registerSWOptions: {
    current: undefined as { onRegisteredSW?: (...a: unknown[]) => void } | undefined,
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

const HIDDEN_APPLY_GRACE_MS = 30 * 1000;
const VISIBLE_IDLE_APPLY_THRESHOLD_MS = 30 * 60 * 1000;
const APPLY_CHECK_POLL_MS = 15 * 1000;

beforeEach(() => {
  updateServiceWorker.mockClear();
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
    const { container } = render(<ReloadPrompt />);
    expect(container).toBeEmptyDOMElement();
  });

  it('does nothing when no update is waiting', async () => {
    state.needRefresh = false;
    render(<ReloadPrompt />);
    await vi.advanceTimersByTimeAsync(VISIBLE_IDLE_APPLY_THRESHOLD_MS);
    expect(updateServiceWorker).not.toHaveBeenCalled();
  });

  it('applies the update once a hidden tab stays hidden past the grace period', async () => {
    render(<ReloadPrompt />);
    setHidden(true);
    expect(updateServiceWorker).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(HIDDEN_APPLY_GRACE_MS);

    expect(updateServiceWorker).toHaveBeenCalledWith(true);
  });

  it('applies on resume when the grace period elapsed while backgrounded, even if the polling tick never ran (mobile OS freezes timers while hidden)', () => {
    render(<ReloadPrompt />);
    setHidden(true);
    // No vi.advanceTimersByTimeAsync here — the tick never fires, as it
    // wouldn't on a real phone that freezes JS while backgrounded. Only the
    // wall clock moves.
    vi.setSystemTime(new Date(Date.now() + HIDDEN_APPLY_GRACE_MS + 1000));
    expect(updateServiceWorker).not.toHaveBeenCalled();

    setHidden(false);

    expect(updateServiceWorker).toHaveBeenCalledWith(true);
  });

  it('does not apply if the tab becomes visible again before the grace period elapses', async () => {
    render(<ReloadPrompt />);
    setHidden(true);
    await vi.advanceTimersByTimeAsync(HIDDEN_APPLY_GRACE_MS / 2);
    setHidden(false);

    await vi.advanceTimersByTimeAsync(HIDDEN_APPLY_GRACE_MS);

    expect(updateServiceWorker).not.toHaveBeenCalled();
  });

  it('applies the update once a visible tab has been idle a long time', async () => {
    render(<ReloadPrompt />);
    await vi.advanceTimersByTimeAsync(VISIBLE_IDLE_APPLY_THRESHOLD_MS);
    expect(updateServiceWorker).toHaveBeenCalledWith(true);
  });

  it('does not apply while a visible tab is in recent use', async () => {
    render(<ReloadPrompt />);
    await vi.advanceTimersByTimeAsync(VISIBLE_IDLE_APPLY_THRESHOLD_MS - 1000);
    expect(updateServiceWorker).not.toHaveBeenCalled();
  });

  it('retries on the next tick if the apply did not cause the page to unload', async () => {
    render(<ReloadPrompt />);
    setHidden(true);
    await vi.advanceTimersByTimeAsync(HIDDEN_APPLY_GRACE_MS);
    expect(updateServiceWorker).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(APPLY_CHECK_POLL_MS);

    expect(updateServiceWorker).toHaveBeenCalledTimes(2);
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
      render(<ReloadPrompt />);
      fireOnRegistered(registration);
      return registration;
    }

    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('re-fetches the service worker and updates it on a healthy response', async () => {
      vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));
      const { update } = setup();

      await vi.advanceTimersByTimeAsync(THIRTY_MINUTES_MS);

      expect(fetch).toHaveBeenCalledWith('sw.js', expect.objectContaining({ cache: 'no-store' }));
      expect(update).toHaveBeenCalledTimes(1);
    });

    it('skips the check while offline', async () => {
      vi.stubGlobal('navigator', { ...navigator, onLine: false });
      const { update } = setup();

      await vi.advanceTimersByTimeAsync(THIRTY_MINUTES_MS);

      expect(fetch).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    });

    it('survives a failed fetch and still checks again next tick', async () => {
      vi.mocked(fetch)
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValue(new Response(null, { status: 200 }));
      const { update } = setup();

      await vi.advanceTimersByTimeAsync(THIRTY_MINUTES_MS);
      expect(update).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(THIRTY_MINUTES_MS);
      expect(update).toHaveBeenCalledTimes(1);
    });

    it('starts only one interval when StrictMode double-invokes registration for the same registration', async () => {
      vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));
      const registration = setup();
      fireOnRegistered(registration);

      await vi.advanceTimersByTimeAsync(THIRTY_MINUTES_MS);

      expect(registration.update).toHaveBeenCalledTimes(1);
    });
  });
});
