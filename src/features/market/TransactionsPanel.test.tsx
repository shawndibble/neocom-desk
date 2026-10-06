import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import '@/i18n';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { TransactionsPanel } from './TransactionsPanel';
import { fakeItemActions, FakeItemActions } from './__fixtures__/itemActions';
import { loadWalletJournal, loadWalletTransactionsWithStatus } from '@/features/character/wallet';
import { loadTypeNames } from '@/features/character/typeNames';
import * as download from '@/lib/download';
import type { WalletJournalEntry, WalletTransaction } from '@/esi/endpoints';

vi.mock('@/features/character/wallet', () => ({
  loadWalletJournal: vi.fn(),
  loadWalletTransactionsWithStatus: vi.fn(),
}));
vi.mock('@/features/character/typeNames', () => ({ loadTypeNames: vi.fn() }));
vi.mock('@/app/loginFlow', () => ({ beginEveLogin: vi.fn() }));

const mockedLoadTransactions = vi.mocked(loadWalletTransactionsWithStatus);
const mockedLoadJournal = vi.mocked(loadWalletJournal);
const mockedTypeNames = vi.mocked(loadTypeNames);

/** Resolves the transactions read with `cached`; `needsReauth` stays false unless given. */
function mockTransactions(
  cached: Awaited<ReturnType<typeof loadWalletTransactionsWithStatus>>['cached'],
  needsReauth = false
) {
  mockedLoadTransactions.mockResolvedValue({ cached, needsReauth });
}

const TYPE_NAMES = new Map([
  [2048, 'Damage Control II'],
  [34, 'Tritanium'],
]);

function transaction(overrides: Partial<WalletTransaction> = {}): WalletTransaction {
  return {
    transaction_id: 1,
    date: new Date().toISOString(),
    location_id: 60003760,
    type_id: 2048,
    unit_price: 460_800,
    quantity: 3,
    client_id: 999,
    is_buy: false,
    journal_ref_id: 1,
    is_personal: true,
    ...overrides,
  };
}

/** Renders the current query string, so a test can assert the filter params left the URL. */
function LocationProbe() {
  return <output data-testid="location-search">{useLocation().search}</output>;
}

function renderPanel(url = '/market/history/transactions') {
  const actions = fakeItemActions();
  const onViewChange = vi.fn();
  render(
    <MemoryRouter initialEntries={[url]}>
      <FakeItemActions actions={actions}>
        <TransactionsPanel onViewChange={onViewChange} />
      </FakeItemActions>
      <LocationProbe />
    </MemoryRouter>
  );
  return { actions, onViewChange };
}

beforeEach(() => {
  vi.clearAllMocks();
  useActiveCharacter.setState({ activeCharacterId: 1, hydrated: true });
  mockedTypeNames.mockResolvedValue(TYPE_NAMES);
  mockedLoadJournal.mockResolvedValue(null);
});

describe('TransactionsPanel — the row as an item', () => {
  it('has no row menu or More actions button: the item name links to Show info', async () => {
    mockTransactions({
      data: [transaction()],
      fetchedAt: new Date(),
      fromCache: false,
      truncated: false,
    });
    renderPanel();

    const row = await screen.findByRole('row', { name: /Damage Control II/ });
    expect(within(row).getByRole('link', { name: 'Damage Control II' })).toBeInTheDocument();
    fireEvent.contextMenu(row);

    // Right-click may still offer the table's own Export; never item actions.
    expect(screen.queryByRole('menuitem', { name: 'Show info' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^More actions/ })).not.toBeInTheDocument();
  });
});

describe('TransactionsPanel — desktop filter and totals', () => {
  function load(data: WalletTransaction[], truncated = false) {
    mockTransactions({
      data,
      fetchedAt: new Date(),
      fromCache: false,
      truncated,
    });
  }
  const FILLS = [
    transaction({ transaction_id: 1, date: '2026-09-20T12:00:00Z' }),
    transaction({
      transaction_id: 2,
      date: '2026-09-10T12:00:00Z',
      type_id: 34,
      is_buy: true,
      quantity: 10,
      unit_price: 5,
    }),
  ];

  it('narrows the rows by item search and totals only what is left', async () => {
    load(FILLS);
    renderPanel();
    await screen.findByRole('row', { name: /Damage Control II/ });
    expect(screen.getByRole('row', { name: /Tritanium/ })).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText(/Search item/), 'trit');

    expect(screen.queryByRole('row', { name: /Damage Control II/ })).not.toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Tritanium/ })).toBeInTheDocument();
    const strip = screen.getByRole('region', { name: 'Totals for the transactions shown' });
    expect(within(strip).getAllByText('-50')).toHaveLength(2);
  });

  it('narrows the rows by side from the URL', async () => {
    load(FILLS);
    renderPanel('/market/history/transactions?txn.side=buy');

    expect(await screen.findByRole('row', { name: /Tritanium/ })).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /Damage Control II/ })).not.toBeInTheDocument();
  });

  it('narrows the rows by date range from the URL', async () => {
    load(FILLS);
    renderPanel('/market/history/transactions?txn.start=2026-09-15');

    expect(await screen.findByRole('row', { name: /Damage Control II/ })).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /Tritanium/ })).not.toBeInTheDocument();
  });

  it('says so when the filter matches nothing, rather than showing a blank table', async () => {
    load(FILLS);
    renderPanel('/market/history/transactions?txn.q=nothing-like-this');

    expect(await screen.findByText('No transactions match this filter.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Totals for the transactions shown' })).toBeNull();
  });

  it('resets a URL-seeded filter that matches nothing, bringing the rows back', async () => {
    load(FILLS);
    renderPanel('/market/history/transactions?txn.start=2026-09-25');
    await screen.findByText('No transactions match this filter.');

    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));

    expect(await screen.findByRole('row', { name: /Damage Control II/ })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Tritanium/ })).toBeInTheDocument();
    expect(screen.queryByText('No transactions match this filter.')).toBeNull();
    expect(screen.getByTestId('location-search')).not.toHaveTextContent('txn.');
  });

  it('says when the fetch stopped at the page cap, so the totals are not read as full history', async () => {
    load(FILLS, true);
    renderPanel();

    expect(
      await screen.findByText(/Only the most recent transactions were fetched/)
    ).toBeInTheDocument();
  });

  it('offers the Wallet Permission grant, not the reconnect empty state, when the read needs re-auth', async () => {
    mockTransactions(null, true);
    renderPanel();

    expect(
      await screen.findByRole('button', { name: 'Log in again with EVE Online' })
    ).toBeInTheDocument();
    expect(screen.queryByText('No transactions cached')).toBeNull();
  });

  it('exports the filtered rows', async () => {
    const spy = vi.spyOn(download, 'downloadTextFile').mockImplementation(() => {});
    const user = userEvent.setup();
    load(FILLS);
    renderPanel('/market/history/transactions?txn.side=buy');
    await screen.findByRole('row', { name: /Tritanium/ });

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Export Transactions' }), {
      button: 0,
      pointerType: 'mouse',
    });
    (await screen.findByRole('menuitem', { name: 'Download CSV' })).focus();
    await user.keyboard('{Enter}');

    await waitFor(() => expect(spy).toHaveBeenCalledOnce());
    expect(spy.mock.calls[0][0]).toMatch(/^neocom-wallet-transactions-\d{4}-\d{2}-\d{2}\.csv$/);
    const lines = (spy.mock.calls[0][1] as string).trim().split('\r\n');
    // Header plus the one buy the filter leaves — the Damage Control II sale is gone.
    expect(lines).toEqual([
      expect.stringContaining('"Date"'),
      '2026-09-10 12:00:00,"Tritanium","Buy",10,5,-50',
    ]);
    spy.mockRestore();
  });
});

describe('TransactionsPanel — margin', () => {
  const BUY = transaction({
    transaction_id: 1,
    journal_ref_id: 11,
    date: '2026-09-10T12:00:00Z',
    is_buy: true,
    quantity: 5,
    unit_price: 400_000,
  });
  const SALE = transaction({ transaction_id: 2, journal_ref_id: 12, date: '2026-09-20T12:00:00Z' });
  const BUILT = transaction({
    transaction_id: 3,
    journal_ref_id: 13,
    date: '2026-09-21T12:00:00Z',
    type_id: 34,
  });
  function taxFor(transactionId: number, amount: number): WalletJournalEntry {
    return {
      id: 900 + transactionId,
      date: '2026-09-20T12:00:00Z',
      ref_type: 'transaction_tax',
      description: '',
      amount,
      context_id: transactionId,
      context_id_type: 'market_transaction_id',
    };
  }
  function load(journal: WalletJournalEntry[] | null) {
    mockTransactions({
      data: [BUY, SALE, BUILT],
      fetchedAt: new Date(),
      fromCache: false,
      truncated: false,
    });
    mockedLoadJournal.mockResolvedValue(
      journal && { data: journal, fetchedAt: new Date(), fromCache: false, truncated: false }
    );
  }
  /** Date, Item, Side, Qty, Unit price, Total, then Margin. */
  function marginCell(row: HTMLElement) {
    return within(row).getAllByRole('cell')[6];
  }

  it('shows a sale its margin over the wallet buys it used, less its sales tax', async () => {
    load([taxFor(2, -49_766.4), taxFor(3, -100)]);
    renderPanel();
    const row = await screen.findByRole('row', { name: /Damage Control II.*Sell/ });
    // 3 × 460,800 − 3 × 400,000 − 49,766
    expect(marginCell(row)).toHaveTextContent('132,634');
  });

  it('shows a dash, never a zero-cost margin, for a sale no wallet buy covers', async () => {
    load([taxFor(2, -49_766.4), taxFor(3, -100)]);
    renderPanel();
    const row = await screen.findByRole('row', { name: /Tritanium/ });
    expect(marginCell(row)).toHaveTextContent('—');
  });

  it('shows a dash when the journal did not load, rather than a tax-free margin', async () => {
    load(null);
    renderPanel();
    const row = await screen.findByRole('row', { name: /Damage Control II.*Sell/ });
    expect(marginCell(row)).toHaveTextContent('—');
  });
});

describe('TransactionsPanel — phone', () => {
  const original = window.matchMedia;
  const originalScroll = Element.prototype.scrollIntoView;
  beforeEach(() => {
    // `useIsPhone` reads a max-width query; answering yes is how a phone looks under test.
    window.matchMedia = (media: string) =>
      ({
        media,
        matches: true,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList;
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    window.matchMedia = original;
    Element.prototype.scrollIntoView = originalScroll;
  });

  function load(data: WalletTransaction[], truncated = false) {
    mockTransactions({
      data,
      fetchedAt: new Date(),
      fromCache: false,
      truncated,
    });
  }

  it('stays a plain table with a Sold / Bought / Net strip, shedding side and margin (date is the default sort: it stays)', async () => {
    load([
      transaction({ transaction_id: 1, date: '2026-09-20T13:27:00Z' }),
      transaction({
        transaction_id: 2,
        date: '2026-09-20T12:00:00Z',
        is_buy: true,
        quantity: 1,
        unit_price: 100_000,
      }),
    ]);
    renderPanel();

    expect(await screen.findAllByRole('link', { name: 'Damage Control II' })).toHaveLength(2);
    expect(screen.getByRole('table')).toBeInTheDocument();
    const row = screen.getAllByRole('row')[1];
    expect(row.querySelector('td[data-label="Side"]')).toHaveClass('max-sm:hidden');
    expect(row.querySelector('td[data-label="Date"]')).not.toHaveClass('max-sm:hidden');
    expect(row.querySelector('td[data-label="Margin"]')).toHaveClass('max-sm:hidden');
    expect(row.querySelector('td[data-label="Total"]')).not.toHaveClass('max-sm:hidden');
    const summary = screen.getByRole('region', { name: 'Totals for the transactions shown' });
    expect(within(summary).getByText('+1,382,400')).toBeInTheDocument();
    expect(within(summary).getByText('-100,000')).toBeInTheDocument();
    expect(within(summary).getByText('+1,282,400')).toBeInTheDocument();
  });

  it('says when the fetch stopped at the page cap', async () => {
    load([transaction()], true);
    renderPanel();

    expect(
      await screen.findByText(/Only the most recent transactions were fetched/)
    ).toBeInTheDocument();
  });

  it('pulses the fill a notification pointed at', async () => {
    load([transaction({ transaction_id: 7 })]);
    render(
      <MemoryRouter initialEntries={['/market/history/transactions?highlight=2048']}>
        <FakeItemActions>
          <TransactionsPanel onViewChange={vi.fn()} />
        </FakeItemActions>
      </MemoryRouter>
    );
    const link = await screen.findByRole('link', { name: 'Damage Control II' });
    const row = link.closest('[data-row-key]');
    expect(row).toHaveAttribute('data-row-key', '7');
    expect(row).toHaveClass('row-pulse');
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it('switches to Ended orders from the header toggle', async () => {
    load([transaction()]);
    const { onViewChange } = renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Ended orders' }));
    expect(onViewChange).toHaveBeenCalledWith('history');
  });
});
