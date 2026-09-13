import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import '@/i18n';
import { BootScreen, BOOT_STALL_MS } from './BootScreen';

const { recoverFromStalledBoot, captureMessage } = vi.hoisted(() => ({
  recoverFromStalledBoot: vi.fn(),
  captureMessage: vi.fn(),
}));
vi.mock('./bootRecovery', () => ({ recoverFromStalledBoot }));
vi.mock('@sentry/react', () => ({ captureMessage }));

beforeEach(() => {
  vi.useFakeTimers();
  recoverFromStalledBoot.mockClear();
  captureMessage.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('BootScreen', () => {
  it('shows only the spinner while the wait is still plausible', () => {
    render(<BootScreen />);
    act(() => {
      vi.advanceTimersByTime(BOOT_STALL_MS - 1);
    });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it('offers a way out once the boot has clearly stalled', async () => {
    render(<BootScreen />);
    act(() => {
      vi.advanceTimersByTime(BOOT_STALL_MS);
    });
    // A blocked IndexedDB upgrade never rejects, so without this the screen
    // is permanent and reinstalling is the only recovery.
    const button = screen.getByRole('button', { name: 'Reload' });
    button.click();
    expect(recoverFromStalledBoot).toHaveBeenCalledOnce();
  });

  it('reports the stall, so a boot that hangs with no Dexie event is still visible', () => {
    render(<BootScreen />);
    act(() => {
      vi.advanceTimersByTime(BOOT_STALL_MS);
    });
    expect(captureMessage).toHaveBeenCalledWith('Boot stalled on BootScreen', {
      level: 'warning',
      extra: { afterMs: BOOT_STALL_MS },
    });
  });
});
