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
  archiveRanges,
  sort = { columnId: 'date', direction: 'desc' },
}: {
  sort?: { columnId: string; direction: 'asc' | 'desc' };
  filter?: WalletJournalFilter;
  rows?: JournalRow[];
  /** The personal journal: own-Character netting on. The corp journal passes false. */
  netted?: boolean;
  keyByCharacter?: boolean;
  highlightRowKey?: string | number | null;
  onFilterChange?: (filter: WalletJournalFilter) => void;
  archiveRanges?: number[];
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
        archiveRanges={archiveRanges}
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
  describe('Range select', () => {
    const optionNames = async () => {
      await userEvent.click(screen.getByRole('combobox', { name: 'Range' }));
      return screen.getAllByRole('option').map((option) => option.textContent?.replace('✓', ''));
    };

    it('offers 7 / 30 days and All history with no archive (corp journal)', async () => {
      render(<Harness netted={false} />);
      expect(await optionNames()).toEqual(['Last 7 days', 'Last 30 days', 'All history']);
    });

    it('adds the longer presets the history reaches', async () => {
      render(<Harness archiveRanges={[90, 180]} />);
      expect(await optionNames()).toEqual([
        'Last 7 days',
        'Last 30 days',
        'Last 3 months',
        'Last 6 months',
        'All history',
      ]);
    });

    it('stores the preset as a relative range and clears both dates', async () => {
      const onFilterChange = vi.fn();
      render(
        <Harness
          archiveRanges={[90]}
          filter={{
            ...EMPTY_WALLET_JOURNAL_FILTER,
            startDate: '2026-01-01',
            endDate: '2026-02-01',
          }}
          onFilterChange={onFilterChange}
        />
      );
      await userEvent.click(screen.getByRole('combobox', { name: 'Range' }));
      await userEvent.click(screen.getByRole('option', { name: 'Last 3 months' }));
      expect(onFilterChange).toHaveBeenCalledWith({
        ...EMPTY_WALLET_JOURNAL_FILTER,
        range: 90,
        startDate: null,
        endDate: null,
      });
    });

    it('All history clears the range and both dates', async () => {
      const onFilterChange = vi.fn();
      render(
        <Harness
          filter={{ ...EMPTY_WALLET_JOURNAL_FILTER, range: 7 }}
          onFilterChange={onFilterChange}
        />
      );
      await userEvent.click(screen.getByRole('combobox', { name: 'Range' }));
      await userEvent.click(screen.getByRole('option', { name: 'All history' }));
      expect(onFilterChange).toHaveBeenCalledWith(EMPTY_WALLET_JOURNAL_FILTER);
    });

    it('shows the preset, and a chip for it, even before the archive info loads', () => {
      render(<Harness filter={{ ...EMPTY_WALLET_JOURNAL_FILTER, range: 90 }} />);
      expect(screen.getByRole('combobox', { name: 'Range' })).toHaveTextContent('Last 3 months');
      expect(screen.getByRole('button', { name: /Last 3 months/ })).toBeInTheDocument();
      expect(screen.queryByText(/^From:/)).not.toBeInTheDocument();
    });

    it('reads Custom for dates that match no preset', () => {
      render(<Harness filter={{ ...EMPTY_WALLET_JOURNAL_FILTER, startDate: '2020-01-01' }} />);
      expect(screen.getByRole('combobox', { name: 'Range' })).toHaveTextContent('Custom');
    });
  });

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
      const picker = screen.getByRole('combobox', { name: 'Sort by' });
      const options = within(picker)
        .getAllByRole('option')
        .map((option) => option.textContent);
      expect(options.join(' ')).toMatch(/Date.*Type.*Amount/);
      expect(options.join(' ')).not.toMatch(/Description|Character|Balance/);
    });

    it('keeps the unchanged table at desktop width', () => {
      render(<Harness rows={days} />);
      expect(document.querySelectorAll('.dt-group-header')).toHaveLength(0);
      expect(screen.queryByRole('combobox', { name: 'Sort by' })).not.toBeInTheDocument();
    });
  });
});
