import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatChip, StatChips } from './StatChip';

describe('StatChip', () => {
  it('renders its label and value', () => {
    render(<StatChip label="Wallet" value="1.2B ISK" />);

    expect(screen.getByText('Wallet')).toBeInTheDocument();
    expect(screen.getByText('1.2B ISK')).toBeInTheDocument();
  });

  it('stays indivisible so a wrapping strip moves it whole', () => {
    // The chip is `h-7` — a fixed height with no room for a second line. As a
    // shrinkable flex child it gets squeezed in a crowded strip until its own
    // text wraps (reported on the Skill Plan header once a Booster added a
    // fifth chip). Refusing to shrink or wrap pushes the decision up to the
    // strip's `flex-wrap`, which has somewhere to put the overflow.
    render(<StatChip label="Training time" value="4d 14h 57m" />);

    const chip = screen.getByText('Training time').parentElement;
    expect(chip).toHaveClass('h-7', 'shrink-0', 'whitespace-nowrap');
  });

  it('draws no box: it is a readout, not a control', () => {
    render(<StatChip label="SP" value="54.3M" tone="accent" />);

    const chip = screen.getByText('SP').parentElement as HTMLElement;
    expect(chip.className).not.toMatch(/(^|\s)(border|bg-|rounded)/);
  });

  it('keeps caller classes alongside its own', () => {
    render(<StatChip label="SP" value="54.3M" className="w-40" />);

    const chip = screen.getByText('SP').parentElement;
    expect(chip).toHaveClass('w-40', 'shrink-0');
  });
});

describe('StatChips', () => {
  it('lays its chips out as one wrapping row', () => {
    render(
      <StatChips>
        <StatChip label="Total SP" value="54.3M" />
        <StatChip label="Unallocated" value="0" />
      </StatChips>
    );

    const row = screen.getByText('Total SP').parentElement?.parentElement;
    expect(row).toHaveClass('flex', 'flex-wrap');
    expect(row?.children).toHaveLength(2);
  });
});
