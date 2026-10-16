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
  netted = true,
  keyByCharacter = false,
  highlightRowKey = null,
  onFilterChange = () => {},
}: {
  filter?: WalletJournalFilter;
  rows?: JournalRow[];
  /** The personal journal: own-Character netting on. The corp journal passes false. */
  netted?: boolean;
  keyByCharacter?: boolean;
  highlightRowKey?: string | number | null;
  onFilterChange?: (filter: WalletJournalFilter) => void;
}) {
  const journalColumns = useJournalColumnsBuilder()(
    () => undefined,
    () => '',
    undefined,
    keyByCharacter ? (id) => `Pilot ${id}` : undefined
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
        keyByCharacter={keyByCharacter}
        highlightRowKey={highlightRowKey}
        panel={{
          open: true,
          onOpenChange: () => {},
          scopeLabel: 'All characters',
          coverage: netted ? { loaded: 2, total: 2, missing: [] } : undefined,
        }}
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

  it('keeps the breakdown panel on a corp journal, with no netting, coverage or Character filter', async () => {
    render(<Harness netted={false} rows={journal.slice(0, 2)} />);
    expect(screen.queryByText(/between your Characters/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Characters loaded/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Where the ISK went' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    const list = await screen.findByRole('table', { name: 'Where the ISK went' });
    expect(within(list).getByText('Bounty prize')).toBeInTheDocument();
  });

  it('says the scope and the date range in the panel subtitle', () => {
    const { rerender } = render(<Harness />);
    expect(
      screen.getByText("All characters · last 30 days · follows the Journal's filters")
    ).toBeInTheDocument();
    rerender(
      <Harness
        filter={{ ...EMPTY_WALLET_JOURNAL_FILTER, startDate: '2026-10-01', endDate: '2026-10-07' }}
      />
    );
    expect(
      screen.getByText("All characters · 2026-10-01 – 2026-10-07 · follows the Journal's filters")
    ).toBeInTheDocument();
  });

  it('keys rows per Character when two Characters carry the same entry id', () => {
    const rows: JournalRow[] = [
      { ...journal[0], characterId: 1 },
      { ...journal[0], characterId: 2 },
    ];
    render(<Harness rows={rows} keyByCharacter highlightRowKey="2:1" />);
    expect(document.querySelector('[data-row-key="1:1"]')).toBeInTheDocument();
    const second = document.querySelector('[data-row-key="2:1"]');
    expect(second).toBeInTheDocument();
    expect(second?.className).toContain('row-pulse');
    expect(document.querySelector('[data-row-key="1:1"]')?.className).not.toContain('row-pulse');
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

  it('shows the active ref type as a selected chip that a click clears', async () => {
    const onFilterChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Harness
        filter={{ ...EMPTY_WALLET_JOURNAL_FILTER, refType: 'bounty_prize' }}
        onFilterChange={onFilterChange}
        netted={false}
      />
    );
    const chip = screen.getByRole('button', { name: 'Type: Bounty prize' });
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    await user.click(chip);
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
