import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { ReloadPrompt } from './ReloadPrompt';

const { updateServiceWorker, setNeedRefresh, state } = vi.hoisted(() => ({
  updateServiceWorker: vi.fn(),
  setNeedRefresh: vi.fn(),
  state: { needRefresh: true },
}));

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [state.needRefresh, setNeedRefresh],
    offlineReady: [false, vi.fn()],
    updateServiceWorker,
  }),
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

  it('moves bottom-center with an accent highlight on desktop, issue #613', () => {
    render(<ReloadPrompt />);
    const toast = screen.getByRole('alert');
    // Mobile: unchanged bottom-right corner toast.
    expect(toast).toHaveClass('right-4', 'bottom-16');
    // Desktop: bottom-center with an accent border so it isn't easy to miss.
    expect(toast).toHaveClass(
      'md:left-1/2',
      'md:-translate-x-1/2',
      'md:bottom-6',
      'md:border-accent'
    );
  });

  it('dismisses the toast', async () => {
    const user = userEvent.setup();
    render(<ReloadPrompt />);
    await user.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(setNeedRefresh).toHaveBeenCalledWith(false);
  });
});
