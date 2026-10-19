import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@/i18n';
import PriceHistoryChart, { HistoryTooltip } from './PriceHistoryChart';
import type { TooltipContentProps } from 'recharts';
import userEvent from '@testing-library/user-event';
import { db } from '@/db';
import {
  useVisiblePriceHistoryColumns,
  DEFAULT_VISIBLE_PRICE_HISTORY_COLUMNS,
} from './priceHistoryColumns';
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

afterEach(async () => {
  cleanup();
  document.body.innerHTML = '';
  await db.settings.clear();
  useVisiblePriceHistoryColumns.setState({
    value: DEFAULT_VISIBLE_PRICE_HISTORY_COLUMNS,
    hydrated: false,
  });
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
    for (const label of ['Traded range', 'Average Price', 'Moving average', 'Volume', 'Orders']) {
      expect(within(legend).getByText(label)).toBeInTheDocument();
    }
    expect(within(legend).queryByText('Daily range')).not.toBeInTheDocument();
  });

  it('explains the traded range from its legend entry', () => {
    render(<PriceHistoryChart points={POINTS} itemName="Tritanium" />);
    fireEvent.focus(
      within(screen.getByRole('list')).getByRole('button', { name: 'About Traded range' })
    );
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      "Traded range is the day's lowest and highest trade."
    );
    expect(screen.getByRole('tooltip')).not.toHaveTextContent(/at close/);
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

  it('stays a plain table on a phone, starting lean without the price range and order count', () => {
    withPhoneViewport(() => {
      render(<PriceHistoryChart points={POINTS} itemName="Tritanium" />);
      const table = screen.getByRole('table');
      expect(table).not.toHaveClass('dt-stack');
      const row = within(table).getAllByRole('row')[1];
      expect(row.querySelector('td[data-label="Daily range"]')).toBeNull();
      expect(row.querySelector('td[data-label="Orders"]')).toBeNull();
      expect(row.querySelector('td[data-label="Average Price"]')).not.toBeNull();
    });
  });

  it('shows every column on a desktop by default', () => {
    render(<PriceHistoryChart points={POINTS} itemName="Tritanium" />);
    const row = within(screen.getByRole('table')).getAllByRole('row')[1];
    expect(row.querySelector('td[data-label="Daily range"]')).not.toBeNull();
    expect(row.querySelector('td[data-label="Orders"]')).not.toBeNull();
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

  describe('with compared regions', () => {
    const DOMAIN = {
      regionId: 10000043,
      name: 'Domain',
      status: 'ready' as const,
      points: [{ date: '2026-08-01', average: 11 }],
    };

    it('names the primary and each compared region in the legend', () => {
      render(
        <PriceHistoryChart
          points={POINTS}
          itemName="Tritanium"
          comparisons={[DOMAIN]}
          primaryRegionName="The Forge"
        />
      );
      const legend = screen.getByRole('list');
      expect(within(legend).getByText('The Forge average')).toBeInTheDocument();
      expect(within(legend).getByText('Domain average')).toBeInTheDocument();
    });

    it('states a region that failed, is loading, or has no trades in the range', () => {
      render(
        <PriceHistoryChart
          points={POINTS}
          itemName="Tritanium"
          primaryRegionName="The Forge"
          comparisons={[
            { ...DOMAIN, status: 'error', points: [] },
            { regionId: 10000032, name: 'Sinq Laison', status: 'loading', points: [] },
            { regionId: 10000030, name: 'Heimatar', status: 'ready', points: [] },
          ]}
        />
      );
      expect(screen.getByText("Domain · couldn't load")).toBeInTheDocument();
      expect(screen.getByText('Sinq Laison · loading…')).toBeInTheDocument();
      expect(screen.getByText('Heimatar · no trades in this range')).toBeInTheDocument();
    });

    it("adds each compared region's average to the day table, on the primary region's days", () => {
      render(
        <PriceHistoryChart
          points={POINTS}
          itemName="Tritanium"
          comparisons={[
            { ...DOMAIN, points: [...DOMAIN.points, { date: '2026-07-30', average: 9 }] },
          ]}
          primaryRegionName="The Forge"
        />
      );
      const table = screen.getByRole('table');
      expect(
        within(table).getByRole('columnheader', { name: /Domain average/ })
      ).toBeInTheDocument();
      // Two primary days, plus the header — Domain's extra day is drawn, not tabled.
      expect(within(table).getAllByRole('row')).toHaveLength(3);
      expect(within(table).getByText('No trades')).toBeInTheDocument();
    });

    it('draws the single-region legend unchanged when nothing is compared', () => {
      render(
        <PriceHistoryChart points={POINTS} itemName="Tritanium" primaryRegionName="The Forge" />
      );
      expect(screen.getByText('Average Price', { selector: 'span' })).toBeInTheDocument();
      expect(screen.queryByText('The Forge average')).not.toBeInTheDocument();
    });
  });

  describe('with hub-station buy and sell series', () => {
    const JITA_OPEN = {
      regionId: 10000002,
      station: 'Jita 4-4',
      points: [
        { date: '2026-08-01', buy: 9, sell: 12 },
        { date: '2026-08-02', buy: 9.5, sell: null },
      ],
    };
    const DOMAIN = {
      regionId: 10000043,
      name: 'Domain',
      status: 'ready' as const,
      points: [{ date: '2026-08-01', average: 11 }],
    };

    it('names the station on the Buy and Sell legend entries and table columns, even alone', () => {
      render(
        <PriceHistoryChart
          points={POINTS}
          itemName="Tritanium"
          primaryRegionId={10000002}
          openPrices={[JITA_OPEN]}
        />
      );
      const legend = screen.getByRole('list');
      expect(within(legend).getByText('Jita 4-4 buy at close')).toBeInTheDocument();
      expect(within(legend).getByText('Jita 4-4 sell at close')).toBeInTheDocument();
      expect(within(legend).queryByText('Buy')).not.toBeInTheDocument();
      // The day table keeps its plain headers; only the chart says "at close".
      const table = screen.getByRole('table');
      expect(within(table).getByRole('columnheader', { name: 'Jita 4-4 buy' })).toBeInTheDocument();
      expect(
        within(table).getByRole('columnheader', { name: 'Jita 4-4 sell' })
      ).toBeInTheDocument();
      expect(within(table).getByRole('columnheader', { name: 'Daily range' })).toBeInTheDocument();
      expect(within(table).queryByRole('columnheader', { name: /at close/ })).toBeNull();
      // Volume and order count stay the region's (ESI).
      expect(within(legend).getByText('Volume')).toBeInTheDocument();
    });

    it('names each compared hub by its station, and an old region-wide series by its region', () => {
      render(
        <PriceHistoryChart
          points={POINTS}
          itemName="Tritanium"
          primaryRegionName="The Forge"
          primaryRegionId={10000002}
          openPrices={[
            JITA_OPEN,
            {
              regionId: 10000043,
              station: 'Amarr VIII',
              points: [{ date: '2026-08-01', buy: 10, sell: 13 }],
            },
            { regionId: 10000032, points: [{ date: '2026-08-01', buy: 10, sell: 13 }] },
          ]}
          comparisons={[DOMAIN, { ...DOMAIN, regionId: 10000032, name: 'Sinq Laison' }]}
        />
      );
      const legend = screen.getByRole('list');
      expect(within(legend).getByText('Jita 4-4 sell at close')).toBeInTheDocument();
      expect(within(legend).getByText('Amarr VIII buy at close')).toBeInTheDocument();
      expect(within(legend).getByText('Sinq Laison buy at close')).toBeInTheDocument();
      expect(within(legend).queryByText(/The Forge buy/)).not.toBeInTheDocument();
    });

    it('names the station in the tooltip', () => {
      render(
        <HistoryTooltip
          {...({} as TooltipContentProps)}
          active
          label="2026-08-01"
          payload={
            [
              {
                payload: {
                  date: '2026-08-01',
                  dateLabel: '2026-08-01',
                  average: 10,
                  lowest: 8,
                  highest: 14,
                  range: [8, 14],
                  movingAverage: undefined,
                  comparison: {},
                  buy: { 10000002: 9 },
                  sell: {},
                },
              },
            ] as never
          }
          comparisons={[]}
          primaryAverageLabel="Average Price"
          comparedAverageLabel={() => ''}
          openLines={[
            {
              regionId: 10000002,
              label: 'Jita 4-4',
              region: { color: 'red', dash: undefined },
              primary: true,
            },
          ]}
          series="both"
        />
      );
      expect(screen.getByText(/Jita 4-4 buy at close:/)).toBeInTheDocument();
      expect(screen.getByText(/Jita 4-4 sell at close: No orders/)).toBeInTheDocument();
      expect(screen.getByText(/^Traded range:/)).toBeInTheDocument();
      expect(screen.queryByText(/Daily range/)).not.toBeInTheDocument();
    });
  });

  describe('with open buy and sell series', () => {
    const FORGE_OPEN = {
      regionId: 10000002,
      points: [
        { date: '2026-08-01', buy: 9, sell: 12 },
        { date: '2026-08-02', buy: 9.5, sell: null },
      ],
    };
    const DOMAIN = {
      regionId: 10000043,
      name: 'Domain',
      status: 'ready' as const,
      points: [{ date: '2026-08-01', average: 11 }],
    };

    it('replaces the average with Buy and Sell in the legend, with no moving average', () => {
      render(
        <PriceHistoryChart
          points={POINTS}
          itemName="Tritanium"
          primaryRegionId={10000002}
          openPrices={[FORGE_OPEN]}
          movingAverage={[{ date: '2026-08-02', average: 10 }]}
        />
      );
      const legend = screen.getByRole('list');
      expect(within(legend).getByText('Best buy at close')).toBeInTheDocument();
      expect(within(legend).getByText('Best sell at close')).toBeInTheDocument();
      expect(within(legend).queryByText('Average Price')).not.toBeInTheDocument();
      expect(within(legend).queryByText('Moving average')).not.toBeInTheDocument();
    });

    it('lists only the side the series choice keeps', () => {
      render(
        <PriceHistoryChart
          points={POINTS}
          itemName="Tritanium"
          primaryRegionId={10000002}
          openPrices={[FORGE_OPEN]}
          series="sell"
        />
      );
      const legend = screen.getByRole('list');
      expect(within(legend).getByText('Best sell at close')).toBeInTheDocument();
      expect(within(legend).queryByText(/buy/i)).not.toBeInTheDocument();
    });

    it('adds Buy and Sell columns, and keeps ESI figures, in the day table', () => {
      render(
        <PriceHistoryChart
          points={POINTS}
          itemName="Tritanium"
          primaryRegionId={10000002}
          openPrices={[FORGE_OPEN]}
        />
      );
      const table = screen.getByRole('table');
      expect(within(table).getByRole('columnheader', { name: 'Buy' })).toBeInTheDocument();
      expect(within(table).getByRole('columnheader', { name: 'Sell' })).toBeInTheDocument();
      expect(within(table).getByRole('columnheader', { name: /Volume/ })).toBeInTheDocument();
      // 2026-08-02 had a buy order but no sell order.
      expect(within(table).getByText('No orders')).toBeInTheDocument();
    });

    it('explains why best buy/sell at close can sit outside the traded range', () => {
      render(
        <PriceHistoryChart
          points={POINTS}
          itemName="Tritanium"
          primaryRegionId={10000002}
          openPrices={[FORGE_OPEN]}
        />
      );
      fireEvent.focus(
        within(screen.getByRole('list')).getByRole('button', { name: 'About Traded range' })
      );
      expect(screen.getByRole('tooltip')).toHaveTextContent(
        'Best buy/sell at close is the best order still listed at 23:45 UTC, so it can sit outside the range.'
      );
    });

    it('draws a region without a series as its average beside one with Buy and Sell', () => {
      render(
        <PriceHistoryChart
          points={POINTS}
          itemName="Tritanium"
          primaryRegionName="The Forge"
          primaryRegionId={10000002}
          openPrices={[FORGE_OPEN]}
          comparisons={[DOMAIN]}
        />
      );
      const legend = screen.getByRole('list');
      expect(within(legend).getByText('The Forge buy at close')).toBeInTheDocument();
      expect(within(legend).getByText('The Forge sell at close')).toBeInTheDocument();
      expect(within(legend).getByText('Domain average')).toBeInTheDocument();
      const table = screen.getByRole('table');
      expect(
        within(table).getByRole('columnheader', { name: /Domain average/ })
      ).toBeInTheDocument();
    });

    it('gives a compared region with a series its own Buy and Sell, not an average', () => {
      render(
        <PriceHistoryChart
          points={POINTS}
          itemName="Tritanium"
          primaryRegionName="The Forge"
          primaryRegionId={10000002}
          openPrices={[
            FORGE_OPEN,
            { regionId: 10000043, points: [{ date: '2026-08-01', buy: 10, sell: 13 }] },
          ]}
          comparisons={[DOMAIN]}
        />
      );
      const legend = screen.getByRole('list');
      expect(within(legend).getByText('Domain buy at close')).toBeInTheDocument();
      expect(within(legend).getByText('Domain sell at close')).toBeInTheDocument();
      expect(within(legend).queryByText('Domain average')).not.toBeInTheDocument();
    });

    it('draws every region as its average under Average, keeping the open columns in the table', () => {
      render(
        <PriceHistoryChart
          points={POINTS}
          itemName="Tritanium"
          primaryRegionName="The Forge"
          primaryRegionId={10000002}
          openPrices={[FORGE_OPEN]}
          openMissing={new Set([10000043])}
          comparisons={[DOMAIN]}
          series="average"
        />
      );
      const legend = screen.getByRole('list');
      expect(within(legend).getByText('The Forge average')).toBeInTheDocument();
      expect(within(legend).getByText('Domain average')).toBeInTheDocument();
      expect(within(legend).queryByText(/buy|sell/i)).not.toBeInTheDocument();
      // Average is the chosen line here, not a stand-in, so no note on it.
      expect(within(legend).queryByText(/no order data/)).not.toBeInTheDocument();
      expect(
        within(legend).queryByRole('button', { name: /no order data/ })
      ).not.toBeInTheDocument();
      const table = screen.getByRole('table');
      expect(
        within(table).getByRole('columnheader', { name: /The Forge buy/ })
      ).toBeInTheDocument();
    });

    it('says when a compared region draws its average for want of order data', () => {
      render(
        <PriceHistoryChart
          points={POINTS}
          itemName="Tritanium"
          primaryRegionName="The Forge"
          primaryRegionId={10000002}
          openPrices={[FORGE_OPEN]}
          openMissing={new Set([10000043])}
          comparisons={[DOMAIN]}
        />
      );
      const legend = screen.getByRole('list');
      expect(within(legend).getByText('The Forge buy at close')).toBeInTheDocument();
      const label = 'Domain average (no order data)';
      expect(within(legend).getByText(label)).toBeInTheDocument();
      expect(within(legend).getByRole('button', { name: `About ${label}` })).toBeInTheDocument();
    });

    it('says so for the primary region too, and not before its read comes back empty', () => {
      const { rerender } = render(
        <PriceHistoryChart points={POINTS} itemName="Tritanium" primaryRegionId={10000060} />
      );
      expect(screen.getByText('Average Price', { selector: 'span' })).toBeInTheDocument();
      rerender(
        <PriceHistoryChart
          points={POINTS}
          itemName="Tritanium"
          primaryRegionId={10000060}
          openMissing={new Set([10000060])}
          series="sell"
        />
      );
      const legend = screen.getByRole('list');
      expect(within(legend).getByText('Average Price (no order data)')).toBeInTheDocument();
      expect(
        within(legend).getByRole('button', { name: 'About Average Price (no order data)' })
      ).toBeInTheDocument();
    });

    it('tables a day that has an open price but no ESI trade, with dashes for the trade figures', () => {
      render(
        <PriceHistoryChart
          points={POINTS}
          itemName="Tritanium"
          primaryRegionId={10000002}
          openPrices={[
            {
              regionId: 10000002,
              points: [{ date: '2026-07-30', buy: 7, sell: 8 }, ...FORGE_OPEN.points],
            },
          ]}
        />
      );
      const rows = within(screen.getByRole('table')).getAllByRole('row');
      // Header, the open-only day, and the two ESI days.
      expect(rows).toHaveLength(4);
      expect(within(rows[1]).getByText('2026-07-30')).toBeInTheDocument();
      expect(within(rows[1]).getAllByText('—').length).toBeGreaterThan(0);
    });

    it('hides and shows table columns through the Columns menu, leaving the export whole', async () => {
      const user = userEvent.setup();
      render(
        <PriceHistoryChart
          points={POINTS}
          itemName="Tritanium"
          primaryRegionId={10000002}
          openPrices={[FORGE_OPEN]}
        />
      );
      expect(
        within(screen.getByRole('table')).getByRole('columnheader', { name: /Sell/ })
      ).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Columns' }));
      await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Sell' }));
      // The open menu hides the page from the accessibility tree.
      const after = screen.getByRole('table', { hidden: true });
      expect(
        within(after).queryByRole('columnheader', { name: /Sell/, hidden: true })
      ).not.toBeInTheDocument();
      expect(
        within(after).getByRole('columnheader', { name: /Buy/, hidden: true })
      ).toBeInTheDocument();
      await user.keyboard('{Escape}');
    });
  });
});
