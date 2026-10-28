import { afterEach, describe, it, expect, vi } from 'vitest';
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

const phone = vi.hoisted(() => ({ value: false }));
vi.mock('@/lib/useIsPhone', () => ({ useIsPhone: () => phone.value }));

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
  sort = { columnId: 'date', direction: 'desc' },
  playerOptions,
}: {
  playerOptions?: { id: string; name: string }[];
  sort?: { columnId: string; direction: 'asc' | 'desc' };
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
        playerOptions={playerOptions}
        filteredJournal={rows}
        breakdownJournal={rows}
        chartJournal={rows}
        journalColumns={journalColumns}
        label="Journal"
        sort={sort}
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

  it('gives a corp journal line with a Player a ⋮ with filters and the player actions; the personal journal has none', async () => {
    const onFilterChange = vi.fn();
    const rows: JournalRow[] = [{ ...journal[0]!, playerId: 42 }, journal[1]!];
    render(
      <Harness
        netted={false}
        rows={rows}
        playerOptions={[{ id: '42', name: 'Pilot Forty-Two' }]}
        onFilterChange={onFilterChange}
      />
    );
    // Only the line with a Player has a menu.
    expect(screen.getAllByRole('button', { name: /More actions for/ })).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: /More actions for Pilot Forty-Two/ }));
    expect(
      await screen.findByRole('menuitem', { name: 'Filter to this type' })
    ).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Open in EVE/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Show info' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Filter to this player' }));
    expect(onFilterChange).toHaveBeenCalledWith(expect.objectContaining({ player: '42' }));
  });

  it('has no row menu on the personal journal', () => {
    render(<Harness />);
    expect(screen.queryByRole('button', { name: /More actions for/ })).not.toBeInTheDocument();
  });

  it('says the scope and the date range in the panel subtitle', () => {
    const { rerender } = render(<Harness />);
    expect(
      screen.getByText("All characters · since 10/7/2026 · follows the Journal's filters")
    ).toBeInTheDocument();
    rerender(
      <Harness
        filter={{ ...EMPTY_WALLET_JOURNAL_FILTER, startDate: '2026-10-01', endDate: '2026-10-07' }}
      />
    );
    expect(
      screen.getByText("All characters · 10/1/2026 – 10/7/2026 · follows the Journal's filters")
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

  describe('on a phone', () => {
    afterEach(() => {
      phone.value = false;
    });

    const days: JournalRow[] = [
      ...journal,
      {
        id: 4,
        date: '2026-10-06T10:00:00Z',
        ref_type: 'bounty_prize',
        amount: 700,
        description: 'z',
      },
    ];

    it('groups lines under UTC day headers, each with a net that leaves out own-Character transfers', () => {
      phone.value = true;
      render(<Harness rows={days} />);
      const headers = document.querySelectorAll('.dt-group-header');
      expect(headers).toHaveLength(2);
      // 5,000 - 2,000; the 900 own-Character transfer is left out.
      expect(headers[0]).toHaveTextContent('Wed 7 Oct · EVE time');
      expect(headers[0]).toHaveTextContent('+3,000');
      expect(headers[1]).toHaveTextContent('+700');
    });

    it('puts the sort in the summary row as an icon, with no sort bar in the table', () => {
      phone.value = true;
      render(<Harness rows={days} />);
      const picker = screen.getByRole('combobox', { name: /^Sort by, now Date/ });
      expect(screen.getByText(/^\d+ entries$/).closest('div')?.parentElement).toContainElement(
        picker
      );
      expect(document.querySelectorAll('select')).toHaveLength(1);
    });

    it('has no sort picker off a phone, or with nothing to sort', () => {
      render(<Harness rows={days} />);
      expect(screen.queryByRole('combobox', { name: /Sort by/ })).not.toBeInTheDocument();
      phone.value = true;
      render(<Harness rows={[]} />);
      expect(screen.queryByRole('combobox', { name: /Sort by/ })).not.toBeInTheDocument();
    });

    it('opens only the newest three days', () => {
      phone.value = true;
      const many = [1, 2, 3, 4, 5].map((n) => ({
        id: 100 + n,
        date: `2026-09-0${n}T10:00:00Z`,
        ref_type: 'bounty_prize',
        amount: 10,
        description: 'd',
      }));
      render(<Harness rows={many} />);
      expect(document.querySelectorAll('.dt-group-header')).toHaveLength(5);
      expect(document.querySelector('[data-row-key="103"]')).toBeInTheDocument();
      expect(document.querySelector('[data-row-key="102"]')).not.toBeInTheDocument();
      expect(document.querySelector('[data-row-key="105"]')).toBeInTheDocument();
      expect(document.querySelector('[data-row-key="101"]')).not.toBeInTheDocument();
    });

    it('opens the day a highlighted line is on', () => {
      phone.value = true;
      const many = [1, 2, 3, 4, 5].map((n) => ({
        id: 100 + n,
        date: `2026-09-0${n}T10:00:00Z`,
        ref_type: 'bounty_prize',
        amount: 10,
        description: 'd',
      }));
      render(<Harness rows={many} highlightRowKey={101} />);
      expect(document.querySelector('[data-row-key="101"]')).toBeInTheDocument();
    });

    it('falls back to Date for a sort the cards lack', () => {
      phone.value = true;
      render(<Harness rows={days} sort={{ columnId: 'description', direction: 'asc' }} />);
      expect(document.querySelectorAll('.dt-group-header')).toHaveLength(2);
    });

    it('folds a day away', async () => {
      phone.value = true;
      const user = userEvent.setup();
      render(<Harness rows={days} />);
      expect(document.querySelector('[data-row-key="4"]')).toBeInTheDocument();
      await user.click(document.querySelectorAll('.dt-group-header button')[1] as HTMLElement);
      expect(document.querySelector('[data-row-key="4"]')).not.toBeInTheDocument();
    });

    it('is a flat list under the Amount sort, and offers only Date, Amount and Type', () => {
      phone.value = true;
      render(<Harness rows={days} sort={{ columnId: 'amount', direction: 'desc' }} />);
      expect(document.querySelectorAll('.dt-group-header')).toHaveLength(0);
      const picker = screen.getByRole('combobox', { name: /^Sort by/ });
      const options = within(picker)
        .getAllByRole('option')
        .map((option) => option.textContent);
      expect(options.join(' ')).toMatch(/Date.*Type.*Amount/);
      expect(options.join(' ')).not.toMatch(/Description|Character|Balance/);
    });

    it('keeps the unchanged table at desktop width', () => {
      render(<Harness rows={days} />);
      expect(document.querySelectorAll('.dt-group-header')).toHaveLength(0);
      expect(screen.queryByRole('combobox', { name: /^Sort by/ })).not.toBeInTheDocument();
    });
  });
});
