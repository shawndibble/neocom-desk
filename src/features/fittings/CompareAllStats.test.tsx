import '@/i18n';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CompareRow } from '@/engine/fittings/fittingCompare';
import { CompareAllStats } from './CompareAllStats';

const row = (key: CompareRow['key'], values: number[]): CompareRow => ({
  key,
  values,
  differs: new Set(values).size > 1,
  bestIndices: [],
  direction: 'higher',
});

const COLUMNS = [
  { letter: 'A', position: 0 },
  { letter: 'B', position: 1 },
];

const ROWS = [row('totalDps', [100, 120]), row('totalVolley', [500, 500])];

describe('CompareAllStats', () => {
  it('shows only differing stats and offers the matching ones', async () => {
    const onShowMatching = vi.fn();
    render(
      <CompareAllStats
        rows={ROWS}
        statsList={[]}
        columns={COLUMNS}
        differencesOnly
        onShowMatching={onShowMatching}
      />
    );
    expect(screen.getByRole('rowheader', { name: 'Total DPS' })).toBeInTheDocument();
    expect(screen.queryByRole('rowheader', { name: 'Total volley' })).toBeNull();
    expect(screen.getByText('1 matching stat hidden.')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Show' }));
    expect(onShowMatching).toHaveBeenCalled();
  });

  it('lists every stat when differences only is off', () => {
    render(
      <CompareAllStats
        rows={ROWS}
        statsList={[]}
        columns={COLUMNS}
        differencesOnly={false}
        onShowMatching={() => {}}
      />
    );
    expect(screen.getByRole('rowheader', { name: 'Total volley' })).toBeInTheDocument();
    expect(screen.queryByText(/matching stat/)).toBeNull();
  });

  it('says so when nothing differs', () => {
    render(
      <CompareAllStats
        rows={[row('totalVolley', [500, 500])]}
        statsList={[]}
        columns={COLUMNS}
        differencesOnly
        onShowMatching={() => {}}
      />
    );
    expect(screen.getByText('Nothing differs between the compared Fittings.')).toBeInTheDocument();
  });
});
