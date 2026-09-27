import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { BootScreen, BOOT_STALL_MS } from './BootScreen';
import { RequireCharacter } from './RequireCharacter';

const { recoverFromStalledBoot, reportBootStallOnce, reportBootStallResolved, useLiveQuery } =
  vi.hoisted(() => ({
    recoverFromStalledBoot: vi.fn(),
    reportBootStallOnce: vi.fn(),
    reportBootStallResolved: vi.fn(),
    useLiveQuery: vi.fn(),
  }));
vi.mock('./bootRecovery', () => ({ recoverFromStalledBoot }));
vi.mock('./bootStallReport', () => ({ reportBootStallOnce, reportBootStallResolved }));
vi.mock('dexie-react-hooks', () => ({ useLiveQuery }));

beforeEach(() => {
  vi.useFakeTimers();
  recoverFromStalledBoot.mockClear();
  reportBootStallOnce.mockClear();
  reportBootStallResolved.mockClear();
  useLiveQuery.mockReturnValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('BootScreen', () => {
  it('shows only the spinner while the wait is still plausible', () => {
    render(<BootScreen gate="root" />);
    act(() => {
      vi.advanceTimersByTime(BOOT_STALL_MS - 1);
    });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(reportBootStallOnce).not.toHaveBeenCalled();
  });

  it('offers a way out, and reports the stall with the gate that mounted it, once the boot has clearly stalled', () => {
    render(<BootScreen gate="require-character" />);
    act(() => {
      vi.advanceTimersByTime(BOOT_STALL_MS);
    });
    expect(reportBootStallOnce).toHaveBeenCalledWith(BOOT_STALL_MS, 'require-character');
    screen.getByRole('button', { name: 'Reload' }).click();
    expect(recoverFromStalledBoot).toHaveBeenCalledOnce();
  });

  it('announces the stall hint through a live region that was already mounted (issue #1494)', () => {
    render(<BootScreen gate="root" />);
    // Present, and empty, before the stall: a live region inserted together
    // with its text is not reliably announced.
    const region = screen.getByTestId('boot-stall-status');
    expect(region).toHaveAttribute('role', 'status');
    expect(region).toBeEmptyDOMElement();
    act(() => {
      vi.advanceTimersByTime(BOOT_STALL_MS);
    });
    expect(region).toHaveTextContent(/another copy of the app/i);
    expect(screen.getByTestId('boot-stall-status')).toBe(region);
  });

  it('disables the button once tapped, so the silent wait cannot start a second flow', () => {
    render(<BootScreen gate="root" />);
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
    const { unmount } = render(<BootScreen gate="root" />);
    unmount();
    act(() => {
      vi.advanceTimersByTime(BOOT_STALL_MS * 2);
    });
    expect(reportBootStallOnce).not.toHaveBeenCalled();
  });

  it('checks in with reportBootStallResolved on unmount, which no-ops unless a stall was reported', () => {
    const { unmount } = render(<BootScreen gate="require-character" />);
    act(() => {
      vi.advanceTimersByTime(BOOT_STALL_MS);
    });
    unmount();
    expect(reportBootStallResolved).toHaveBeenCalledWith(false);
  });

  it('reports the reload button as already tapped if the gate clears while recovery is in flight', () => {
    const { unmount } = render(<BootScreen gate="require-character" />);
    act(() => {
      vi.advanceTimersByTime(BOOT_STALL_MS);
    });
    act(() => {
      screen.getByRole('button', { name: 'Reload' }).click();
    });
    // The gate resolving on its own mid-recovery — recoverFromStalledBoot is
    // mocked, so nothing here actually reloads the page.
    unmount();
    expect(reportBootStallResolved).toHaveBeenCalledWith(true);
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
