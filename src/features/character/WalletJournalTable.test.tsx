import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { useTableExport } from '@/components/ui/useTableExport';
import type { JournalRow } from '@/engine/journalNetting';
import { JournalTable } from './WalletJournalTable';
import { useJournalColumnsBuilder } from './walletJournal';
import { EMPTY_WALLET_JOURNAL_FILTER, type WalletJournalFilter } from './walletJournalFilter';
import { walletJournalCsvColumns } from './walletJournalCsv';

const journal: JournalRow[] = [
  { id: 1, date: '2026-10-07T23:47:00Z', ref_type: 'bounty_prize', amount: 5000, description: 'x' },
  {
    id: 2,
    date: '2026-10-07T23:48:00Z',
    ref_type: 'market_escrow',
    amount: -2000,
    description: 'y',
  },
  {
    id: 3,
    date: '2026-10-07T23:49:00Z',
    ref_type: 'player_donation',
    amount: 900,
    description: 'from alt',
    internal: true,
  },
];

function Harness({
  filter = EMPTY_WALLET_JOURNAL_FILTER,
  rows = journal,
  withPanel = true,
  onFilterChange = () => {},
}: {
  filter?: WalletJournalFilter;
  rows?: JournalRow[];
  withPanel?: boolean;
  onFilterChange?: (filter: WalletJournalFilter) => void;
}) {
  const journalColumns = useJournalColumnsBuilder()(
    () => undefined,
    () => ''
  );
  const tableExport = useTableExport({
    surface: 'wallet-journal',
    rows,
    columns: walletJournalCsvColumns((key: string) => key),
  });
  return (
    <MemoryRouter>
      <JournalTable
        filter={filter}
        onFilterChange={onFilterChange}
        refTypeOptions={['bounty_prize', 'market_escrow']}
        filteredJournal={rows}
        breakdownJournal={rows}
        journalColumns={journalColumns}
        label="Journal"
        sort={{ columnId: 'date', direction: 'desc' }}
        onSortChange={() => {}}
        tableExport={tableExport}
        panel={
          withPanel
            ? { open: true, onOpenChange: () => {}, scopeLabel: 'All characters' }
            : undefined
        }
      />
    </MemoryRouter>
  );
}

describe('JournalTable', () => {
  it('leaves own-Character transfers out of the In / Out / Net line and says so', () => {
    render(<Harness />);
    expect(screen.getByText('3 entries')).toBeInTheDocument();
    expect(screen.getByText('1 entry between your Characters left out')).toBeInTheDocument();
    // The list still shows the transfer, marked.
    expect(screen.getAllByText('Between your Characters').length).toBeGreaterThan(0);
  });

  it('shows no netting line on a journal without the panel (corp)', () => {
    render(<Harness withPanel={false} rows={journal.slice(0, 2)} />);
    expect(screen.queryByText(/between your Characters/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Where the ISK went' })).not.toBeInTheDocument();
  });

  it('filters the Journal when a ref type is clicked in the panel', async () => {
    const onFilterChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onFilterChange={onFilterChange} />);
    const list = await screen.findByRole('table', { name: 'Where the ISK went' });
    await user.click(within(list).getByText('Bounty prize'));
    expect(onFilterChange).toHaveBeenCalledWith({
      ...EMPTY_WALLET_JOURNAL_FILTER,
      refType: 'bounty_prize',
    });
  });

  it('shows the active ref type as a removable chip', async () => {
    const onFilterChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Harness
        filter={{ ...EMPTY_WALLET_JOURNAL_FILTER, refType: 'bounty_prize' }}
        onFilterChange={onFilterChange}
        withPanel={false}
      />
    );
    await user.click(screen.getByRole('button', { name: /Type: Bounty prize ×/ }));
    expect(onFilterChange).toHaveBeenCalledWith(EMPTY_WALLET_JOURNAL_FILTER);
  });
});

describe('JournalTable filtered summary status', () => {
  const statusRegion = (container: HTMLElement) =>
    container.querySelector<HTMLElement>('[role=status].sr-only');

  it('is an empty live region while no filter is set', () => {
    const { container } = render(<Harness />);
    expect(statusRegion(container)).toBeEmptyDOMElement();
  });

  it('holds the plain-text summary once a filter is set', async () => {
    const { container } = render(
      <Harness filter={{ ...EMPTY_WALLET_JOURNAL_FILTER, text: 'x' }} />
    );
    await waitFor(() => expect(statusRegion(container)).toHaveTextContent(/3 entries · net /));
  });
});
