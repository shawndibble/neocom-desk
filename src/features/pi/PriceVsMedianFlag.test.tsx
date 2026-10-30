import '@/i18n';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PriceVsMedianFlag } from './PriceVsMedianFlag';

describe('PriceVsMedianFlag', () => {
  it('flags a spike with its percent', () => {
    render(<PriceVsMedianFlag pct={34} />);
    expect(screen.getByText('+34% vs 90d')).toBeInTheDocument();
  });

  it('flags a drop with its own wording', () => {
    render(<PriceVsMedianFlag pct={-28} />);
    expect(screen.getByText(/−28% vs 90d · below its 90-day price/)).toBeInTheDocument();
  });

  it.each([5, -5, null, undefined])('shows nothing for %s', (pct) => {
    const { container } = render(<PriceVsMedianFlag pct={pct} />);
    expect(container).toBeEmptyDOMElement();
  });
});
