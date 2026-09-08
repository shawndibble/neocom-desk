import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { StandingIcon } from './StandingIcon';
import { standingTier } from './standingTier';

describe('standingTier', () => {
  // Contact standings are set at five fixed values in game, so these are the
  // boundaries that matter: +5 is "good", not "excellent", and -5 is "bad".
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
});
