import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { StandingBar } from './StandingBar';

describe('StandingBar', () => {
  it('announces the numeric value and fills toward the positive side for a good standing', () => {
    render(<StandingBar value={10} />);
    const bar = screen.getByRole('img', { name: 'Standing: 10' });
    expect(bar).toBeInTheDocument();
  });

  it('announces a negative value and clamps out-of-range input to -10..10', () => {
    render(<StandingBar value={-25} />);
    expect(screen.getByRole('img', { name: 'Standing: -10' })).toBeInTheDocument();
  });

  it('renders a neutral bar for zero standing', () => {
    render(<StandingBar value={0} />);
    expect(screen.getByRole('img', { name: 'Standing: 0' })).toBeInTheDocument();
  });
});
