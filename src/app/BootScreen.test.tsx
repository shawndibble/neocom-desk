import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { BootScreen, BOOT_STALL_MS } from './BootScreen';
import { RequireCharacter } from './RequireCharacter';

const { recoverFromStalledBoot, reportBootStallOnce, useLiveQuery } = vi.hoisted(() => ({
  recoverFromStalledBoot: vi.fn(),
  reportBootStallOnce: vi.fn(),
  useLiveQuery: vi.fn(),
}));
vi.mock('./bootRecovery', () => ({ recoverFromStalledBoot }));
vi.mock('./bootStallReport', () => ({ reportBootStallOnce }));
vi.mock('dexie-react-hooks', () => ({ useLiveQuery }));

beforeEach(() => {
  vi.useFakeTimers();
  recoverFromStalledBoot.mockClear();
  reportBootStallOnce.mockClear();
  useLiveQuery.mockReturnValue(undefined);
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
    expect(reportBootStallOnce).not.toHaveBeenCalled();
  });

  it('offers a way out, and reports the stall, once the boot has clearly stalled', () => {
    render(<BootScreen />);
    act(() => {
      vi.advanceTimersByTime(BOOT_STALL_MS);
    });
    expect(reportBootStallOnce).toHaveBeenCalledWith(BOOT_STALL_MS);
    screen.getByRole('button', { name: 'Reload' }).click();
    expect(recoverFromStalledBoot).toHaveBeenCalledOnce();
  });

  it('disables the button once tapped, so the silent wait cannot start a second flow', () => {
    render(<BootScreen />);
    act(() => {
      vi.advanceTimersByTime(BOOT_STALL_MS);
    });
    act(() => {
      screen.getByRole('button', { name: 'Reload' }).click();
    });
    const button = screen.getByRole('button', { name: 'Reloading…' });
    expect(button).toBeDisabled();
    button.click();
    expect(recoverFromStalledBoot).toHaveBeenCalledOnce();
  });

  it('does not arm the timer after unmount', () => {
    const { unmount } = render(<BootScreen />);
    unmount();
    act(() => {
      vi.advanceTimersByTime(BOOT_STALL_MS * 2);
    });
    expect(reportBootStallOnce).not.toHaveBeenCalled();
  });
});

describe('a gate whose Dexie read never settles', () => {
  it('reaches the escape hatch through RequireCharacter', () => {
    // The symptom itself, not just the component: a pending read leaves
    // `useLiveQuery` at `undefined`, and the gate must still mount BootScreen
    // with a live timer.
    render(
      <MemoryRouter initialEntries={['/mail']}>
        <RequireCharacter />
      </MemoryRouter>
    );
    act(() => {
      vi.advanceTimersByTime(BOOT_STALL_MS);
    });
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });
});
