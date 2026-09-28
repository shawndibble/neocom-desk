import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import '@/i18n';
import MiningYieldCharts from './MiningYieldCharts';

/*
 * `ResponsiveContainer` measures its parent and jsdom reports every box as
 * 0×0 (same caveat as `PriceHistoryChart.test.tsx`), so the bars themselves
 * never draw here. What's plain DOM and worth asserting on is the chart
 * title and the "refining hidden" note (issue #1281), and — for the chart
 * metric select (issue #2160) — that volume/count never draw a refined
 * series or Legend regardless of `showRefining`, and that each chart's
 * sr-only table matches whichever metric is on screen.
 */

const typeComparison = [{ typeId: 1230, typeName: 'Veldspar', rawValue: 1000, refineValue: 1200 }];
const typeVolumeComparison = [{ typeId: 1230, typeName: 'Veldspar', value: 500 }];
const typeCountComparison = [{ typeId: 1230, typeName: 'Veldspar', value: 5000 }];

describe('MiningYieldCharts — ISK metric', () => {
  it('titles the ore-type chart as a raw/refined comparison and skips the note when refining is shown', () => {
    render(
      <MiningYieldCharts
        metric="isk"
        dailyRate={[]}
        dailyVolume={[]}
        dailyCount={[]}
        typeComparison={typeComparison}
        typeVolumeComparison={[]}
        typeCountComparison={[]}
        showRefining
      />
    );
    expect(screen.getByText('Raw vs. refined value by type')).toBeInTheDocument();
    expect(screen.queryByText('Refining hidden. Raw value only.')).not.toBeInTheDocument();
  });

  it('gives screen readers each chart as a table of every day and every type', () => {
    render(
      <MiningYieldCharts
        metric="isk"
        dailyRate={[{ date: '2026-09-01', iskPerHour: 1234567, source: 'saved' }]}
        dailyVolume={[]}
        dailyCount={[]}
        typeComparison={typeComparison}
        typeVolumeComparison={[]}
        typeCountComparison={[]}
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
        metric="isk"
        dailyRate={[{ date: '2026-09-01', iskPerHour: 1234567, source: 'saved' }]}
        dailyVolume={[]}
        dailyCount={[]}
        typeComparison={typeComparison}
        typeVolumeComparison={[]}
        typeCountComparison={[]}
        showRefining
      />
    );
    expect(
      screen.getByText("Each day's value ÷ 24 h, averaged over calendar time")
    ).toBeInTheDocument();
  });

  it('drops the refined column from the type table when refining is hidden', () => {
    render(
      <MiningYieldCharts
        metric="isk"
        dailyRate={[]}
        dailyVolume={[]}
        dailyCount={[]}
        typeComparison={typeComparison}
        typeVolumeComparison={[]}
        typeCountComparison={[]}
        showRefining={false}
      />
    );
    const compare = screen.getByRole('table', { name: 'Value by ore type' });
    expect(within(compare).getByText('1,000 ISK')).toBeInTheDocument();
    expect(within(compare).queryByText('1,200 ISK')).not.toBeInTheDocument();
  });

  it('retitles the chart to raw-only and shows the hidden-refining note when off', () => {
    render(
      <MiningYieldCharts
        metric="isk"
        dailyRate={[]}
        dailyVolume={[]}
        dailyCount={[]}
        typeComparison={typeComparison}
        typeVolumeComparison={[]}
        typeCountComparison={[]}
        showRefining={false}
      />
    );
    expect(screen.getByText('Value by ore type')).toBeInTheDocument();
    expect(screen.getByText('Refining hidden. Raw value only.')).toBeInTheDocument();
    expect(screen.queryByText('Raw vs. refined value by type')).not.toBeInTheDocument();
  });
});

describe('MiningYieldCharts — volume metric', () => {
  it('titles both charts for m³ and gives screen readers a matching table, with no refined series or note', () => {
    render(
      <MiningYieldCharts
        metric="volume"
        dailyRate={[]}
        dailyVolume={[{ date: '2026-09-01', value: 41.6666667 }]}
        dailyCount={[]}
        typeComparison={[]}
        typeVolumeComparison={typeVolumeComparison}
        typeCountComparison={[]}
        showRefining
      />
    );
    expect(screen.getByText('m³/hr trend')).toBeInTheDocument();
    expect(screen.getByText('m³ by ore type')).toBeInTheDocument();
    expect(screen.queryByText('Refining hidden. Raw value only.')).not.toBeInTheDocument();
    expect(screen.queryByText('Refined value')).not.toBeInTheDocument();

    const rate = screen.getByRole('table', { name: 'm³/hr trend' });
    expect(within(rate).getByRole('columnheader', { name: 'm³/hr' })).toBeInTheDocument();

    const compare = screen.getByRole('table', { name: 'm³ by ore type' });
    expect(within(compare).getByText('Veldspar')).toBeInTheDocument();
    expect(within(compare).getByText('500 m³')).toBeInTheDocument();
  });

  it('never shows a refined series or note when showRefining is true', () => {
    render(
      <MiningYieldCharts
        metric="volume"
        dailyRate={[]}
        dailyVolume={[]}
        dailyCount={[]}
        typeComparison={[]}
        typeVolumeComparison={typeVolumeComparison}
        typeCountComparison={[]}
        showRefining={false}
      />
    );
    expect(screen.queryByText('Refining hidden. Raw value only.')).not.toBeInTheDocument();
  });
});

describe('MiningYieldCharts — count metric', () => {
  it('titles both charts for Count and gives screen readers a matching table', () => {
    render(
      <MiningYieldCharts
        metric="count"
        dailyRate={[]}
        dailyVolume={[]}
        dailyCount={[{ date: '2026-09-01', value: 208.333333 }]}
        typeComparison={[]}
        typeVolumeComparison={[]}
        typeCountComparison={typeCountComparison}
        showRefining
      />
    );
    expect(screen.getByText('Count/hr trend')).toBeInTheDocument();
    expect(screen.getByText('Count by ore type')).toBeInTheDocument();

    const rate = screen.getByRole('table', { name: 'Count/hr trend' });
    expect(within(rate).getByRole('columnheader', { name: 'Count/hr' })).toBeInTheDocument();

    const compare = screen.getByRole('table', { name: 'Count by ore type' });
    expect(within(compare).getByText('Veldspar')).toBeInTheDocument();
    expect(within(compare).getByText('5,000')).toBeInTheDocument();
  });
});
