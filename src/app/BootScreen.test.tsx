import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import '@/i18n';
import { BootScreen, BOOT_STALL_MS } from './BootScreen';

const { recoverFromStalledBoot } = vi.hoisted(() => ({
  recoverFromStalledBoot: vi.fn(),
}));
vi.mock('./bootRecovery', () => ({ recoverFromStalledBoot }));

beforeEach(() => {
  vi.useFakeTimers();
  recoverFromStalledBoot.mockClear();
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
});
