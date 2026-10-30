import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@/i18n';
import { LivePriceStatus, PriceMark } from './LivePriceStatus';

afterEach(cleanup);

const progress = { checking: false, done: 0, total: 0, failed: 0, checkedAt: null };

describe('LivePriceStatus', () => {
  it('shows nothing before a run', () => {
    const { container } = render(<LivePriceStatus live={progress} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the count while checking', () => {
    render(<LivePriceStatus live={{ ...progress, checking: true, done: 23, total: 60 }} />);
    expect(screen.getByRole('status')).toHaveTextContent('Checking live prices 23 / 60');
  });

  it('says how old the live prices are once done', () => {
    render(
      <LivePriceStatus
        live={{ ...progress, done: 60, total: 60, checkedAt: Date.now() - 14_000 }}
      />
    );
    expect(screen.getByText(/Live prices · checked \d+ s ago/)).toBeInTheDocument();
  });

  it('does not claim every row is live while one failed', () => {
    render(
      <LivePriceStatus
        live={{ ...progress, done: 60, total: 60, failed: 1, checkedAt: Date.now() }}
      />
    );
    expect(screen.getByText(/Live prices for 59 of 60 rows/)).toBeInTheDocument();
  });

  it('hides the done line for Compare Hubs', () => {
    const { container } = render(
      <LivePriceStatus
        checkingOnly
        live={{ ...progress, done: 8, total: 8, checkedAt: Date.now() }}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('PriceMark', () => {
  it('marks a cached and a failed price in words, and a live one not at all', () => {
    const { container, rerender } = render(<PriceMark state="live" />);
    expect(container).toBeEmptyDOMElement();
    rerender(<PriceMark state="cached" />);
    expect(screen.getByText(/Cached price/)).toBeInTheDocument();
    rerender(<PriceMark state="failed" />);
    expect(screen.getByText(/Fuzzwork price/)).toBeInTheDocument();
  });
});
