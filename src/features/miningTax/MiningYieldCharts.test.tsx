import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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

  it('retitles the chart to raw-only and shows the hidden-refining note when off', () => {
    render(
      <MiningYieldCharts dailyRate={[]} typeComparison={typeComparison} showRefining={false} />
    );
    expect(screen.getByText('Value by ore type')).toBeInTheDocument();
    expect(screen.getByText('Refining hidden. Raw value only.')).toBeInTheDocument();
    expect(screen.queryByText('Raw vs. refined value by type')).not.toBeInTheDocument();
  });
});
