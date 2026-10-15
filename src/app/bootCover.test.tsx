// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen } from '@testing-library/react';
import '@/i18n';
import { hideBootCover, showBootCover, useBootCover } from './bootCover';
import { BootCoverHost } from './BootCoverHost';

vi.mock('./bootRecovery', () => ({ recoverFromStalledBoot: vi.fn() }));
vi.mock('./bootStallReport', () => ({
  reportBootStallOnce: vi.fn(),
  reportBootStallResolved: vi.fn(),
}));

afterEach(() => act(() => hideBootCover()));

describe('boot cover', () => {
  it('is hidden until shown, and follows show/hide', () => {
    const { result } = renderHook(() => useBootCover());
    expect(result.current).toBe(false);
    act(() => showBootCover());
    expect(result.current).toBe(true);
    act(() => hideBootCover());
    expect(result.current).toBe(false);
  });

  it('host renders the boot screen over everything only while shown', () => {
    render(<BootCoverHost />);
    expect(screen.queryByTestId('boot-cover')).not.toBeInTheDocument();
    act(() => showBootCover());
    expect(screen.getByTestId('boot-cover')).toHaveTextContent('Neocom Desk');
    act(() => hideBootCover());
    expect(screen.queryByTestId('boot-cover')).not.toBeInTheDocument();
  });
});
