import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { IskDelta } from './IskDelta';

describe('IskDelta', () => {
  it('signs and tones a gain', () => {
    render(<IskDelta amount={1500000} decimals={0} />);
    const el = screen.getByText('+1,500,000');
    expect(el).toHaveClass('text-isk-pos');
  });

  it('keeps the minus and tones a loss', () => {
    render(<IskDelta amount={-250} decimals={0} />);
    expect(screen.getByText('-250')).toHaveClass('text-isk-neg');
  });

  it('leaves a figure that rounds to zero plain', () => {
    render(<IskDelta amount={0.2} decimals={0} />);
    const el = screen.getByText('0');
    expect(el).not.toHaveClass('text-isk-pos');
    expect(el).not.toHaveClass('text-isk-neg');
  });

  it('defaults to Market precision and keeps the caller className', () => {
    render(<IskDelta amount={10} className="font-semibold" />);
    const el = screen.getByText(/^\+10/);
    expect(el).toHaveClass('font-semibold', 'text-isk-pos');
  });
});
