import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Spinner } from './Spinner';

describe('Spinner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the status spinner immediately without delayMs', () => {
    render(<Spinner label="Loading orders" />);
    expect(screen.getByRole('status', { name: 'Loading orders' })).toBeInTheDocument();
  });

  it('holds back the status spinner until delayMs elapses', () => {
    const { container } = render(<Spinner size="sm" label="Loading orders" delayMs={200} />);
    expect(screen.queryByRole('status')).toBeNull();
    const placeholder = container.firstElementChild as HTMLElement;
    expect(placeholder).toHaveAttribute('aria-hidden', 'true');
    expect(placeholder.className).toContain('size-4');

    act(() => {
      vi.advanceTimersByTime(199);
    });
    expect(screen.queryByRole('status')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole('status', { name: 'Loading orders' })).toBeInTheDocument();
  });

  it('clears the pending delay on unmount', () => {
    const { unmount } = render(<Spinner delayMs={200} />);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
