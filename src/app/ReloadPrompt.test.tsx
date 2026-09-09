import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { ReloadPrompt } from './ReloadPrompt';

const { updateServiceWorker, setNeedRefresh, state, registerSWOptions } = vi.hoisted(() => ({
  updateServiceWorker: vi.fn(),
  setNeedRefresh: vi.fn(),
  state: { needRefresh: true },
  registerSWOptions: {
    current: undefined as { onRegisteredSW?: (...a: unknown[]) => void } | undefined,
  },
}));

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: (options?: { onRegisteredSW?: (...a: unknown[]) => void }) => {
    registerSWOptions.current = options;
    return {
      needRefresh: [state.needRefresh, setNeedRefresh],
      offlineReady: [false, vi.fn()],
      updateServiceWorker,
    };
  },
}));

beforeEach(() => {
  updateServiceWorker.mockClear();
  setNeedRefresh.mockClear();
  state.needRefresh = true;
});

describe('ReloadPrompt', () => {
  it('renders nothing when no update is waiting', () => {
    state.needRefresh = false;
    render(<ReloadPrompt />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the update toast and reloads on click', async () => {
    const user = userEvent.setup();
    render(<ReloadPrompt />);
    expect(screen.getByRole('alert')).toHaveTextContent(/new version/i);
    await user.click(screen.getByRole('button', { name: /reload/i }));
    expect(updateServiceWorker).toHaveBeenCalledWith(true);
  });

  it('moves bottom-center with a heavier border on desktop, issue #613', () => {
    render(<ReloadPrompt />);
    const toast = screen.getByRole('alert');
    // Mobile: unchanged bottom-right corner toast.
    expect(toast).toHaveClass('right-4', 'bottom-16');
    // Desktop: bottom-center and a heavier border so it isn't easy to miss —
    // no accent/shadow, which DESIGN.md §6 reserves for interactive elements
    // and popovers/menus respectively.
    expect(toast).toHaveClass('md:left-1/2', 'md:-translate-x-1/2', 'md:bottom-6', 'md:border-2');
  });

  it('dismisses the toast', async () => {
    const user = userEvent.setup();
    render(<ReloadPrompt />);
    await user.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(setNeedRefresh).toHaveBeenCalledWith(false);
  });

  describe('periodic update check', () => {
    const TEN_MINUTES_MS = 10 * 60 * 1000;

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
      vi.useFakeTimers();
      vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    });

    it('re-fetches the service worker and updates it on a healthy response', async () => {
      vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));
      const { update } = setup();

      await vi.advanceTimersByTimeAsync(TEN_MINUTES_MS);

      expect(fetch).toHaveBeenCalledWith('sw.js', expect.objectContaining({ cache: 'no-store' }));
      expect(update).toHaveBeenCalledTimes(1);
    });

    it('skips the check while offline', async () => {
      vi.stubGlobal('navigator', { ...navigator, onLine: false });
      const { update } = setup();

      await vi.advanceTimersByTimeAsync(TEN_MINUTES_MS);

      expect(fetch).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    });

    it('survives a failed fetch and still checks again next tick', async () => {
      vi.mocked(fetch)
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValue(new Response(null, { status: 200 }));
      const { update } = setup();

      await vi.advanceTimersByTimeAsync(TEN_MINUTES_MS);
      expect(update).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(TEN_MINUTES_MS);
      expect(update).toHaveBeenCalledTimes(1);
    });

    it('starts only one interval when StrictMode double-invokes registration for the same registration', async () => {
      vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));
      const registration = setup();
      fireOnRegistered(registration);

      await vi.advanceTimersByTimeAsync(TEN_MINUTES_MS);

      expect(registration.update).toHaveBeenCalledTimes(1);
    });
  });
});
