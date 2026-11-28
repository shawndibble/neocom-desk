import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stubViewport } from '@/test/viewport';
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

  it('shows its label beside the arc with showLabel, keeping the status name', () => {
    render(<Spinner size="sm" label="Loading orders" showLabel />);
    expect(screen.getByRole('status', { name: 'Loading orders' })).toHaveTextContent(
      'Loading orders'
    );
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

  it.each([
    ['page', 'py-16'],
    ['panel', 'py-8'],
  ] as const)('block="%s" centres the spinner in a %s row', (block, padding) => {
    const { container } = render(<Spinner block={block} label="Loading orders" delayMs={0} />);
    expect(container.firstElementChild).toHaveClass('flex', 'justify-center', padding);
    expect(screen.getByRole('status', { name: 'Loading orders' })).toBeInTheDocument();
  });

  it('holds a block spinner back 200ms by default', () => {
    render(<Spinner block="page" label="Loading orders" />);
    expect(screen.queryByRole('status')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.getByRole('status', { name: 'Loading orders' })).toBeInTheDocument();
  });

  it('holds a block spinner back under reduced motion too', () => {
    const restore = stubViewport('(prefers-reduced-motion: reduce)');
    render(<Spinner block="panel" label="Loading orders" />);
    expect(screen.queryByRole('status')).toBeNull();
    restore();
  });

  it('adds no wrapper without block', () => {
    const { container } = render(<Spinner label="Loading orders" />);
    expect(container.firstElementChild).toHaveAttribute('role', 'status');
  });
});
