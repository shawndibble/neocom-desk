import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@/i18n';
import { StandingIcon } from './StandingIcon';
import { standingTier } from './standingTier';

describe('standingTier', () => {
  it('puts the fixed contact values on the tier the game shows for them', () => {
    expect(standingTier(10)).toBe('excellent');
    expect(standingTier(5)).toBe('good');
    expect(standingTier(0)).toBe('neutral');
    expect(standingTier(-5)).toBe('bad');
    expect(standingTier(-10)).toBe('terrible');
  });

  it('reads a continuous standing on the same scale', () => {
    expect(standingTier(7.5)).toBe('excellent');
    expect(standingTier(0.1)).toBe('good');
    expect(standingTier(-0.1)).toBe('bad');
    expect(standingTier(-6.2)).toBe('terrible');
  });
});

describe('StandingIcon', () => {
  it('announces the tier and the number, since the tag prints neither', () => {
    render(<StandingIcon value={10} />);
    expect(screen.getByRole('img', { name: 'Excellent standing (10)' })).toBeInTheDocument();
  });

  it('clamps out-of-range input to -10..10', () => {
    render(<StandingIcon value={-25} />);
    expect(screen.getByRole('img', { name: 'Terrible standing (-10)' })).toBeInTheDocument();
  });

  it('uses a caller-supplied label instead of the bare tier + number', () => {
    render(<StandingIcon value={-10} label="Your contact: Terrible standing (-10)" />);
    expect(
      screen.getByRole('img', { name: 'Your contact: Terrible standing (-10)' })
    ).toBeInTheDocument();
  });

  it('takes keyboard focus and reveals its tooltip there', () => {
    render(<StandingIcon value={5} />);
    const tag = screen.getByRole('img', { name: 'Good standing (5)' });
    expect(tag).toHaveAttribute('tabindex', '0');
    fireEvent.focus(tag);
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveTextContent('Good standing (5)');
    expect(tag).toHaveAttribute('aria-describedby', tooltip.id);
  });

  it('separates the tiers that share a sign by more than their colour', () => {
    const mark = (value: number) => {
      const { container, unmount } = render(<StandingIcon value={value} />);
      const rects = [...container.querySelectorAll('rect')]
        .filter((rect) => rect.getAttribute('fill') === '#fcfefc')
        .map((rect) =>
          ['x', 'y', 'width', 'height'].map((a) => rect.getAttribute(a) ?? '0').join(',')
        )
        .join(' ');
      unmount();
      return rects;
    };

    expect(mark(-10)).not.toContain('9,9');
    expect(mark(-10)).not.toBe('');

    expect(mark(-10)).not.toBe(mark(-5));
    expect(mark(10)).not.toBe(mark(5));
    expect(mark(-5)).not.toBe(mark(0));
    expect(mark(0)).not.toBe(mark(5));
  });
});
