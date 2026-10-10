import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import { NARROW_QUERY } from '@/lib/useIsNarrow';
import { useTableExport } from '@/components/ui/useTableExport';
import type { WalletJournalEntry } from '@/esi/endpoints';
import { JournalTable } from './WalletJournalTable';
import { useJournalColumnsBuilder } from './walletJournal';
import { EMPTY_WALLET_JOURNAL_FILTER } from './walletJournalFilter';
import { walletJournalCsvColumns } from './walletJournalCsv';
import { useJournalBreakdownPref, JOURNAL_BREAKDOWN_SETTING_KEY } from './journalBreakdownPref';

const journal: WalletJournalEntry[] = [
  { id: 1, date: '2026-10-07T23:47:00Z', ref_type: 'bounty_prize', amount: 5000, description: 'x' },
  {
    id: 2,
    date: '2026-10-07T23:48:00Z',
    ref_type: 'market_escrow',
    amount: -2000,
    description: 'y',
  },
];

function Harness({ rows = journal }: { rows?: WalletJournalEntry[] }) {
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
        filter={EMPTY_WALLET_JOURNAL_FILTER}
        onFilterChange={() => {}}
        refTypeOptions={['bounty_prize', 'market_escrow']}
        filteredJournal={rows}
        breakdownJournal={rows}
        journalColumns={journalColumns}
        label="Journal"
        sort={{ columnId: 'date', direction: 'desc' }}
        onSortChange={() => {}}
        tableExport={tableExport}
      />
    </MemoryRouter>
  );
}

const manyTypes = (n: number): WalletJournalEntry[] =>
  Array.from({ length: n }, (_, i) => ({
    id: 100 + i,
    date: '2026-10-07T23:47:00Z',
    ref_type: `type_${i}`,
    amount: 1000,
    description: 'z',
  }));

const realMatchMedia = window.matchMedia;

/** The jsdom stub never matches, which `useIsNarrow` reads as "not narrow". */
function setNarrow(narrow: boolean) {
  window.matchMedia = (media: string) =>
    ({
      media,
      matches: narrow && media === NARROW_QUERY,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

beforeEach(async () => {
  await db.settings.clear();
  useJournalBreakdownPref.setState({ value: null, hydrated: false });
});

afterEach(() => {
  window.matchMedia = realMatchMedia;
});

const breakdownTable = () => screen.queryByRole('table', { name: 'Where the ISK went' });
const toggle = () => screen.findByRole('button', { name: /(Show|Hide) breakdown/ });

describe('JournalTable breakdown panel', () => {
  it('is open on a wide screen until the pilot toggles it', async () => {
    setNarrow(false);
    render(<Harness />);
    expect(await toggle()).toHaveAttribute('aria-expanded', 'true');
    expect(breakdownTable()).toBeInTheDocument();
  });

  it('starts folded on a wide screen when there are more than 6 ref types', async () => {
    setNarrow(false);
    render(<Harness rows={manyTypes(7)} />);
    expect(await toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(breakdownTable()).not.toBeInTheDocument();
  });

  it('starts open on a wide screen with exactly 6 ref types', async () => {
    setNarrow(false);
    render(<Harness rows={manyTypes(6)} />);
    expect(await toggle()).toHaveAttribute('aria-expanded', 'true');
  });

  it('keeps a stored open choice with many ref types', async () => {
    setNarrow(false);
    await db.settings.put({ key: JOURNAL_BREAKDOWN_SETTING_KEY, value: true });
    render(<Harness rows={manyTypes(14)} />);
    expect(await toggle()).toHaveAttribute('aria-expanded', 'true');
  });

  it('is folded on a phone until the pilot toggles it', async () => {
    setNarrow(true);
    render(<Harness />);
    expect(await toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(breakdownTable()).not.toBeInTheDocument();
  });

  it('keeps a closed choice on a wide screen, and stores it', async () => {
    setNarrow(false);
    const user = userEvent.setup();
    const { unmount } = render(<Harness />);
    await user.click(await toggle());
    expect(breakdownTable()).not.toBeInTheDocument();
    unmount();

    // A fresh mount (a reload) reads the stored choice back.
    useJournalBreakdownPref.setState({ value: null, hydrated: false });
    render(<Harness />);
    expect(await toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(breakdownTable()).not.toBeInTheDocument();
    expect((await db.settings.get(JOURNAL_BREAKDOWN_SETTING_KEY))?.value).toBe(false);
  });

  it('keeps an open choice on a phone', async () => {
    setNarrow(true);
    const user = userEvent.setup();
    const { unmount } = render(<Harness />);
    await user.click(await toggle());
    expect(breakdownTable()).toBeInTheDocument();
    unmount();

    useJournalBreakdownPref.setState({ value: null, hydrated: false });
    render(<Harness />);
    expect(await toggle()).toHaveAttribute('aria-expanded', 'true');
    expect(breakdownTable()).toBeInTheDocument();
  });

  it('hydrates from a stored value without first showing the default', async () => {
    setNarrow(false);
    await db.settings.put({ key: JOURNAL_BREAKDOWN_SETTING_KEY, value: false });
    render(<Harness />);
    // Held back until the stored choice loads: never rendered open first.
    expect(breakdownTable()).not.toBeInTheDocument();
    expect(await toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(breakdownTable()).not.toBeInTheDocument();
  });
});
