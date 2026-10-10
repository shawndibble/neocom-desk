import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveStatus } from './LiveStatus';
import { Modal } from './Modal';

describe('LiveStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const flush = () => act(() => vi.advanceTimersByTime(1));

  it('is an empty status region when silent, and the same node once it has text', () => {
    const { rerender } = render(<LiveStatus>{null}</LiveStatus>);
    flush();
    const region = screen.getByRole('status');
    expect(region).toBeEmptyDOMElement();
    rerender(<LiveStatus>12 results</LiveStatus>);
    expect(screen.getByRole('status')).toBe(region);
    expect(region).toHaveTextContent('12 results');
    rerender(<LiveStatus>{false}</LiveStatus>);
    expect(region).toBeEmptyDOMElement();
  });

  it('renders empty on mount with a message already set, then fills one tick later', () => {
    render(<LiveStatus>Copied</LiveStatus>);
    const region = screen.getByRole('status');
    expect(region).toBeEmptyDOMElement();
    flush();
    expect(region).toHaveTextContent('Copied');
  });

  it('clears its pending fill timer on unmount', () => {
    const { unmount } = render(<LiveStatus>Copied</LiveStatus>);
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('empties then refills when announceKey changes with the same text', () => {
    const { rerender } = render(<LiveStatus announceKey={1}>Copied</LiveStatus>);
    flush();
    const region = screen.getByRole('status');
    expect(region).toHaveTextContent('Copied');
    rerender(<LiveStatus announceKey={2}>Copied</LiveStatus>);
    expect(region).toBeEmptyDOMElement();
    flush();
    expect(region).toHaveTextContent('Copied');
  });

  it('passes id and data-testid through', () => {
    render(
      <LiveStatus id="status-1" data-testid="live">
        Hi
      </LiveStatus>
    );
    const region = screen.getByTestId('live');
    expect(region).toHaveAttribute('id', 'status-1');
    expect(region).toHaveClass('sr-only');
  });

  it('renders inside the dialog when used in a Modal, not on document.body', () => {
    render(
      <Modal open onClose={() => {}} title="Dialog">
        <LiveStatus>Saved</LiveStatus>
      </Modal>
    );
    flush();
    expect(screen.getByRole('dialog')).toContainElement(screen.getByRole('status'));
  });
});
