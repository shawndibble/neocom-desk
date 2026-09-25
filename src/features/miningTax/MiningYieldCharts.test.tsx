import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import '@/i18n';
import MiningYieldCharts from './MiningYieldCharts';

/*
 * `ResponsiveContainer` measures its parent and jsdom reports every box as
 * 0×0 (same caveat as `PriceHistoryChart.test.tsx`), so the bars themselves
 * never draw here. What's plain DOM and worth asserting on is the chart
 * title and the "refining hidden" note (issue #1281).
 */

const typeComparison = [{ typeId: 1230, typeName: 'Veldspar', rawValue: 1000, refineValue: 1200 }];

describe('MiningYieldCharts', () => {
  it('titles the ore-type chart as a raw/refined comparison and skips the note when refining is shown', () => {
    render(<MiningYieldCharts dailyRate={[]} typeComparison={typeComparison} showRefining />);
    expect(screen.getByText('Raw vs. refined value by type')).toBeInTheDocument();
    expect(screen.queryByText('Refining hidden. Raw value only.')).not.toBeInTheDocument();
  });

  it('gives screen readers each chart as a table of every day and every type', () => {
    render(
      <MiningYieldCharts
        dailyRate={[{ date: '2026-09-01', iskPerHour: 1234567, source: 'saved' }]}
        typeComparison={typeComparison}
        showRefining
      />
    );
    const rate = screen.getByRole('table', { name: 'ISK/hr trend' });
    expect(within(rate).getByRole('columnheader', { name: 'ISK/hr' })).toBeInTheDocument();
    expect(within(rate).getByText('1,234,567 ISK')).toBeInTheDocument();

    const compare = screen.getByRole('table', { name: 'Raw vs. refined value by type' });
    expect(within(compare).getByText('Veldspar')).toBeInTheDocument();
    expect(within(compare).getByText('1,000 ISK')).toBeInTheDocument();
    expect(within(compare).getByText('1,200 ISK')).toBeInTheDocument();
  });

  it('states the rate chart time basis under its title', () => {
    render(
      <MiningYieldCharts
        dailyRate={[{ date: '2026-09-01', iskPerHour: 1234567, source: 'saved' }]}
        typeComparison={typeComparison}
        showRefining
      />
    );
    expect(
      screen.getByText("Each day's value ÷ 24 h, averaged over calendar time")
    ).toBeInTheDocument();
  });

  it('drops the refined column from the type table when refining is hidden', () => {
    render(
      <MiningYieldCharts dailyRate={[]} typeComparison={typeComparison} showRefining={false} />
    );
    const compare = screen.getByRole('table', { name: 'Value by ore type' });
    expect(within(compare).getByText('1,000 ISK')).toBeInTheDocument();
    expect(within(compare).queryByText('1,200 ISK')).not.toBeInTheDocument();
  });

  it('retitles the chart to raw-only and shows the hidden-refining note when off', () => {
    render(
      <MiningYieldCharts dailyRate={[]} typeComparison={typeComparison} showRefining={false} />
    );
    expect(screen.getByText('Value by ore type')).toBeInTheDocument();
    expect(screen.getByText('Refining hidden. Raw value only.')).toBeInTheDocument();
    expect(screen.queryByText('Raw vs. refined value by type')).not.toBeInTheDocument();
  });
});
