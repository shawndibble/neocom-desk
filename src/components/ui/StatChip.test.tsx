import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatChip } from './StatChip';

describe('StatChip', () => {
  it('renders its label and value', () => {
    render(<StatChip label="Wallet" value="1.2B ISK" />);

    expect(screen.getByText('Wallet')).toBeInTheDocument();
    expect(screen.getByText('1.2B ISK')).toBeInTheDocument();
  });

  it('stays an indivisible box so a wrapping strip moves it whole', () => {
    // The chip is `h-7` — a fixed height with no room for a second line. As a
    // shrinkable flex child it gets squeezed in a crowded strip until its own
    // text wraps and spills past the border (reported on the Skill Plan header
    // once a Booster added a fifth chip). Refusing to shrink or wrap pushes
    // the decision up to the strip's `flex-wrap`, which has somewhere to put
    // the overflow.
    render(<StatChip label="Training time" value="4d 14h 57m" />);

    const chip = screen.getByText('Training time').parentElement;
    expect(chip).toHaveClass('h-7', 'shrink-0', 'whitespace-nowrap');
  });

  it('keeps caller classes alongside its own', () => {
    render(<StatChip label="SP" value="54.3M" className="w-40" />);

    const chip = screen.getByText('SP').parentElement;
    expect(chip).toHaveClass('w-40', 'shrink-0');
  });
});
