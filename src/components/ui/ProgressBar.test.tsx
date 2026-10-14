import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProgressBar } from './ProgressBar';

const fill = (bar: HTMLElement) => bar.firstElementChild as HTMLElement;

describe('ProgressBar', () => {
  it('names itself and reports value and range to assistive tech', () => {
    render(<ProgressBar label="Cooldown" value={40} />);
    const bar = screen.getByRole('progressbar', { name: 'Cooldown' });
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
    expect(bar).toHaveAttribute('aria-valuenow', '40');
  });

  it('fills value over max, and reports the raw figures', () => {
    render(<ProgressBar label="Remaining" value={25} max={200} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuemax', '200');
    expect(bar).toHaveAttribute('aria-valuenow', '25');
    expect(fill(bar).style.width).toBe('12.5%');
  });

  it('clamps an overshoot, an undershoot and an empty range', () => {
    const { rerender } = render(<ProgressBar label="x" value={140} />);
    expect(fill(screen.getByRole('progressbar')).style.width).toBe('100%');
    rerender(<ProgressBar label="x" value={-5} />);
    expect(fill(screen.getByRole('progressbar')).style.width).toBe('0%');
    rerender(<ProgressBar label="x" value={5} max={0} />);
    expect(fill(screen.getByRole('progressbar')).style.width).toBe('0%');
  });

  it('is indeterminate with no value: no now/max, a pulsing partial fill', () => {
    render(<ProgressBar label="Searching" value={null} />);
    const bar = screen.getByRole('progressbar', { name: 'Searching' });
    expect(bar).not.toHaveAttribute('aria-valuenow');
    expect(bar).not.toHaveAttribute('aria-valuemax');
    expect(fill(bar).className).toContain('motion-safe:animate-pulse');
    expect(fill(bar).style.width).toBe('30%');
  });

  it('colours the fill by tone, accent by default', () => {
    const { rerender } = render(<ProgressBar label="x" value={10} />);
    expect(fill(screen.getByRole('progressbar')).className).toContain('bg-accent');
    rerender(<ProgressBar label="x" value={10} tone="warning" />);
    expect(fill(screen.getByRole('progressbar')).className).toContain('bg-warning');
    rerender(<ProgressBar label="x" value={10} tone="success" />);
    expect(fill(screen.getByRole('progressbar')).className).toContain('bg-success');
  });

  it('lifts its track one step off the surface it sits on', () => {
    const { rerender } = render(<ProgressBar label="x" value={10} />);
    expect(screen.getByRole('progressbar')).toHaveClass('bg-panel-2');
    rerender(<ProgressBar label="x" value={10} surface="panel-2" />);
    expect(screen.getByRole('progressbar')).toHaveClass('bg-line');
    expect(screen.getByRole('progressbar')).not.toHaveClass('bg-panel-2');
  });

  it('takes layout classes for the track and stays valid inside inline content', () => {
    render(<ProgressBar label="x" value={10} className="w-24" />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveClass('w-24');
    // Spans, so it can sit in a table cell or a flex span without invalid nesting.
    expect(bar.tagName).toBe('SPAN');
    expect(fill(bar).tagName).toBe('SPAN');
  });
});
