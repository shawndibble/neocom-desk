import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { CorpCorrectedAmount, CorpOverlapMark } from './CorpLineMarks';

describe('CorpCorrectedAmount', () => {
  it('keeps the old figure on the line and says the corporation corrected it', () => {
    render(
      <CorpCorrectedAmount
        correction={{ kind: 'adjustment', before: 900_000, after: 800_000, reasons: ['Wrong hub'] }}
      >
        800,000.00 ISK
      </CorpCorrectedAmount>
    );
    expect(screen.getByText(/^900,000/)).toHaveClass('line-through');
    expect(screen.getByText('800,000.00 ISK', { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/Corrected by the corporation, was 900,000/)).toBeInTheDocument();
  });

  it('says a write-off as one', () => {
    render(
      <CorpCorrectedAmount
        correction={{ kind: 'write-off', before: 500, after: 0, reasons: ['Goodwill'] }}
      >
        0.00 ISK
      </CorpCorrectedAmount>
    );
    expect(screen.getByText(/Written off by the corporation, was 500/)).toBeInTheDocument();
  });
});

describe('CorpOverlapMark', () => {
  it('names the clash with the miner’s own list for a screen reader', () => {
    render(<CorpOverlapMark />);
    expect(screen.getByText(/also on your own list/)).toBeInTheDocument();
  });
});
