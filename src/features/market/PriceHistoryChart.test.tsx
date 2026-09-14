import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import '@/i18n';
import PriceHistoryChart from './PriceHistoryChart';
import { historyPoint } from '@/engine/market/__fixtures__/priceHistory';

/*
 * `ResponsiveContainer` measures its parent, and jsdom reports every box as
 * 0×0 — so the plot itself never draws here and there is no SVG to assert
 * against. What these tests cover is everything around it that is plain DOM
 * and carries the same facts: the legend (DESIGN.md §7 — colour is never the
 * only signal) and the sr-only table that is the chart's accessible
 * equivalent. Those are also the parts a reader on a screen reader, or on a
 * phone with no right-hand axis, is actually left with.
 *
 * `vitest.setup.ts` stubs `matchMedia` to never match, so the default here is
 * a desktop viewport and `withPhoneViewport` is what reaches the phone branch
 * at all — without it every phone commitment in this component ships
 * unexercised.
 */

/**
 * Runs `body` with `matchMedia` answering yes, which is how `useIsPhone`'s
 * max-width query reads as a phone. Same override the Market route tests use.
 */
function withPhoneViewport(body: () => void): void {
  const original = window.matchMedia;
  window.matchMedia = (media: string) =>
    ({
      media,
      matches: true,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
  try {
    body();
  } finally {
    window.matchMedia = original;
  }
}

afterEach(() => {
  document.body.innerHTML = '';
});

const POINTS = [
  historyPoint({
    date: '2026-08-01',
    average: 10,
    lowest: 8,
    highest: 14,
    volume: 500,
    orderCount: 12,
  }),
  historyPoint({
    date: '2026-08-02',
    average: 12,
    lowest: 11,
    highest: 13,
    volume: 600,
    orderCount: 9,
  }),
];

describe('PriceHistoryChart', () => {
  it('lists every series in the legend, so no series is identified by colour alone', () => {
    render(
      <PriceHistoryChart
        points={POINTS}
        itemName="Tritanium"
        movingAverage={[{ date: '2026-08-02', average: 11 }]}
      />
    );
    const legend = screen.getByRole('list');
    for (const label of ['Daily range', 'Average Price', 'Moving average', 'Volume', 'Orders']) {
      expect(within(legend).getByText(label)).toBeInTheDocument();
    }
  });

  it('leaves the moving average out of the legend when there is no line to name', () => {
    render(<PriceHistoryChart points={POINTS} itemName="Tritanium" />);
    expect(within(screen.getByRole('list')).queryByText('Moving average')).not.toBeInTheDocument();
  });

  it('gives the accessible table the day’s range and order count, not just the average', () => {
    render(<PriceHistoryChart points={POINTS} itemName="Tritanium" />);
    const table = screen.getByRole('table');
    expect(within(table).getByRole('columnheader', { name: 'Daily range' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Orders' })).toBeInTheDocument();
    const firstRow = within(table).getAllByRole('row')[1];
    expect(firstRow).toHaveTextContent('8.00 – 14.00');
    expect(firstRow).toHaveTextContent('12');
  });

  // A folding phone reports ~1900px unfolded, so anything that hid this table
  // behind a max-width test made it vanish on the hinge. It is visible at
  // every width; only its layout changes.
  it('shows the per-day table on a phone', () => {
    withPhoneViewport(() => {
      render(<PriceHistoryChart points={POINTS} itemName="Tritanium" />);
      expect(screen.getByRole('table')).not.toHaveClass('sr-only');
    });
  });

  it('still shows the per-day table above phone width', () => {
    render(<PriceHistoryChart points={POINTS} itemName="Tritanium" />);
    expect(screen.getByRole('table')).not.toHaveClass('sr-only');
  });

  it('pairs the day figures two to a row in its stacked cards', () => {
    render(<PriceHistoryChart points={POINTS} itemName="Tritanium" />);
    expect(screen.getByRole('table')).toHaveClass('dt-stack-2col');
  });

  it('still names every series in the legend on a phone, where an axis no longer does', () => {
    withPhoneViewport(() => {
      render(<PriceHistoryChart points={POINTS} itemName="Tritanium" />);
      const legend = screen.getAllByRole('list')[0];
      expect(within(legend).getByText('Orders')).toBeInTheDocument();
      expect(within(legend).getByText('Volume')).toBeInTheDocument();
    });
  });

  it('names the item in the figure label so the chart is not an unlabelled image', () => {
    render(<PriceHistoryChart points={POINTS} itemName="Tritanium" />);
    expect(
      screen.getByRole('img', {
        name: 'Daily price range, average, traded volume and order count for Tritanium',
      })
    ).toBeInTheDocument();
  });
});
