import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
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
    days: { day: string; in: number }[];
    onSelectDay: (day: string) => void;
  }) => (
    <>
      <button type="button" onClick={() => onSelectDay('2026-10-07')}>
        bars {days.length}
      </button>
      <button type="button" onClick={() => onSelectDay('2026-10-01')}>
        empty day
      </button>
    </>
  ),
}));

const rows: JournalRow[] = [
  { id: 1, date: '2026-10-07T12:00:00Z', ref_type: 'bounty_prizes', description: '', amount: 5 },
  { id: 2, date: '2026-10-08T12:00:00Z', ref_type: 'bounty_prizes', description: '', amount: -2 },
];

describe('IskFlowChart', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-10T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('filters the Journal to a clicked day', async () => {
    const onFilterChange = vi.fn();
    render(
      <IskFlowChart
        rows={rows}
        filter={EMPTY_WALLET_JOURNAL_FILTER}
        onFilterChange={onFilterChange}
      />
    );
    await userEvent.click(await screen.findByRole('button', { name: /^bars/ }));
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
    expect(screen.queryByRole('button', { name: /^bars/ })).not.toBeInTheDocument();
    expect(useJournalFlowChartHidden.getState().value).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Show chart' }));
    expect(await screen.findByRole('button', { name: /^bars/ })).toBeInTheDocument();
    expect(useJournalFlowChartHidden.getState().value).toBe(false);
  });

  it('clears the day when the selected day is clicked again', async () => {
    const onFilterChange = vi.fn();
    render(
      <IskFlowChart
        rows={rows}
        filter={{ ...EMPTY_WALLET_JOURNAL_FILTER, startDate: '2026-10-07', endDate: '2026-10-07' }}
        onFilterChange={onFilterChange}
      />
    );
    await userEvent.click(await screen.findByRole('button', { name: /^bars/ }));
    expect(onFilterChange).toHaveBeenCalledWith(EMPTY_WALLET_JOURNAL_FILTER);
  });

  it('ignores a day with no entries', async () => {
    const onFilterChange = vi.fn();
    render(
      <IskFlowChart
        rows={rows}
        filter={EMPTY_WALLET_JOURNAL_FILTER}
        onFilterChange={onFilterChange}
      />
    );
    await userEvent.click(await screen.findByRole('button', { name: 'empty day' }));
    expect(onFilterChange).not.toHaveBeenCalled();
  });

  it('draws the last 30 days with no date filter, 92 with a long range', async () => {
    const { unmount } = render(
      <IskFlowChart rows={rows} filter={EMPTY_WALLET_JOURNAL_FILTER} onFilterChange={vi.fn()} />
    );
    expect(await screen.findByRole('button', { name: 'bars 30' })).toBeInTheDocument();
    unmount();
    render(
      <IskFlowChart
        rows={rows}
        filter={{ ...EMPTY_WALLET_JOURNAL_FILTER, startDate: '2026-01-01', endDate: '2026-10-10' }}
        onFilterChange={vi.fn()}
      />
    );
    expect(await screen.findByRole('button', { name: 'bars 92' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /last 92 days of this range/ })).toBeInTheDocument();
  });

  it('renders nothing when hidden and there is no flow', () => {
    useJournalFlowChartHidden.setState({ value: true, hydrated: true });
    const { container } = render(
      <IskFlowChart rows={[]} filter={EMPTY_WALLET_JOURNAL_FILTER} onFilterChange={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
