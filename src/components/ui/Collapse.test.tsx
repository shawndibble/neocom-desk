import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Collapse, COLLAPSE_MS } from './Collapse';

describe('Collapse', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('mounts nothing while shut', () => {
    render(<Collapse open={false}>Body</Collapse>);
    expect(screen.queryByText('Body')).toBeNull();
  });

  it('mounts the body as soon as it opens', () => {
    const { rerender } = render(<Collapse open={false}>Body</Collapse>);
    rerender(<Collapse open>Body</Collapse>);
    expect(screen.getByText('Body')).toBeInTheDocument();
  });

  it('keeps the body while it slides shut, inert, then unmounts it', () => {
    const { rerender, container } = render(<Collapse open>Body</Collapse>);
    rerender(<Collapse open={false}>Body</Collapse>);
    expect(screen.getByText('Body')).toBeInTheDocument();
    expect(container.firstElementChild).toHaveAttribute('inert');
    act(() => vi.advanceTimersByTime(COLLAPSE_MS));
    expect(screen.queryByText('Body')).toBeNull();
  });
});
