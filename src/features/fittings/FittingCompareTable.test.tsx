import '@/i18n';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FittingCompareTable } from './FittingCompareTable';
import type { CompareRow } from '@/engine/fittings/fittingCompare';

const ROWS: CompareRow[] = [
  { key: 'ehp', values: [1000, 2000], differs: true, bestIndices: [1] },
  { key: 'cpuUsed', values: [10, 10], differs: false, bestIndices: [] },
];

const COLUMNS = [
  { index: 0, statsIndex: 0, header: 'Fit A' },
  { index: 1, statsIndex: 1, header: 'Fit B' },
];

describe('FittingCompareTable', () => {
  it('shows every row when differences-only is off', () => {
    render(<FittingCompareTable rows={ROWS} columns={COLUMNS} differencesOnly={false} />);
    expect(screen.getByText('EHP')).toBeInTheDocument();
    expect(screen.getByText('CPU used')).toBeInTheDocument();
  });

  it('hides a row that does not differ when differences-only is on', () => {
    render(<FittingCompareTable rows={ROWS} columns={COLUMNS} differencesOnly={true} />);
    expect(screen.getByText('EHP')).toBeInTheDocument();
    expect(screen.queryByText('CPU used')).not.toBeInTheDocument();
  });

  it('marks the best value with sr-only text, not colour alone', () => {
    render(<FittingCompareTable rows={ROWS} columns={COLUMNS} differencesOnly={true} />);
    // The best cell's accessible text includes "(Best)" beyond the raw number.
    expect(screen.getByText('(Best)')).toBeInTheDocument();
  });

  it('shows a dash for a column whose stats failed and maps the rest by stats position', () => {
    const columns = [
      { index: 0, statsIndex: null, header: 'Broken' },
      { index: 1, statsIndex: 0, header: 'Fit B' },
      { index: 2, statsIndex: 1, header: 'Fit C' },
    ];
    const rows: CompareRow[] = [
      { key: 'ehp', values: [1000, 2000], differs: true, bestIndices: [1] },
    ];
    render(<FittingCompareTable rows={rows} columns={columns} differencesOnly={false} />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('2000', { exact: false })).toBeInTheDocument();
    expect(screen.getAllByText('(Best)')).toHaveLength(1);
  });

  it('shows a message when nothing differs and differences-only is on', () => {
    const tied: CompareRow[] = [
      { key: 'ehp', values: [1000, 1000], differs: false, bestIndices: [] },
    ];
    render(<FittingCompareTable rows={tied} columns={COLUMNS} differencesOnly={true} />);
    expect(screen.getByText('Nothing differs between the compared Fittings.')).toBeInTheDocument();
  });
});
