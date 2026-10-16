import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { JournalRow } from '@/engine/journalNetting';
import { IskFlowChart } from './IskFlowChart';
import { useJournalFlowChartHidden } from './journalFlowChartPref';
import { EMPTY_WALLET_JOURNAL_FILTER } from './walletJournalFilter';

// recharts has no layout in jsdom: swap the bars for a stub that exposes the click.
vi.mock('./IskFlowChartBars', () => ({
  default: ({
    days,
    onSelectDay,
  }: {
    days: { day: string }[];
    onSelectDay: (day: string) => void;
  }) => (
    <button type="button" onClick={() => onSelectDay(days[0].day)}>
      bars {days.length}
    </button>
  ),
}));

const rows: JournalRow[] = [
  { id: 1, date: '2026-10-07T12:00:00Z', ref_type: 'bounty_prizes', description: '', amount: 5 },
  { id: 2, date: '2026-10-08T12:00:00Z', ref_type: 'bounty_prizes', description: '', amount: -2 },
];

describe('IskFlowChart', () => {
  it('filters the Journal to a clicked day', async () => {
    const onFilterChange = vi.fn();
    render(
      <IskFlowChart
        rows={rows}
        filter={EMPTY_WALLET_JOURNAL_FILTER}
        onFilterChange={onFilterChange}
      />
    );
    await userEvent.click(await screen.findByRole('button', { name: 'bars 2' }));
    expect(onFilterChange).toHaveBeenCalledWith({
      ...EMPTY_WALLET_JOURNAL_FILTER,
      startDate: '2026-10-07',
      endDate: '2026-10-07',
    });
  });

  it('names the picked ref type in the heading', async () => {
    render(
      <IskFlowChart
        rows={rows}
        filter={{ ...EMPTY_WALLET_JOURNAL_FILTER, refType: 'bounty_prizes' }}
        onFilterChange={vi.fn()}
      />
    );
    expect(await screen.findByRole('heading', { name: /^Daily flow · .+/ })).toBeInTheDocument();
  });

  it('hides and shows the chart, remembering the choice', async () => {
    render(
      <IskFlowChart rows={rows} filter={EMPTY_WALLET_JOURNAL_FILTER} onFilterChange={vi.fn()} />
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Hide chart' }));
    expect(screen.queryByRole('button', { name: 'bars 2' })).not.toBeInTheDocument();
    expect(useJournalFlowChartHidden.getState().value).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Show chart' }));
    expect(await screen.findByRole('button', { name: 'bars 2' })).toBeInTheDocument();
    expect(useJournalFlowChartHidden.getState().value).toBe(false);
  });
});
