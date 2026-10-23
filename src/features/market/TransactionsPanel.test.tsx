import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import '@/i18n';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { db } from '@/db';
import { TransactionsPanel } from './TransactionsPanel';
import {
  DEFAULT_VISIBLE_TRANSACTIONS_COLUMNS,
  TRANSACTIONS_COLUMN_IDS,
  useVisibleTransactionsColumns,
} from './transactionsColumns';
import { WithPageHeaderSlots } from './__fixtures__/pageHeaderSlots';
import { fakeItemActions, FakeItemActions } from './__fixtures__/itemActions';
import { loadWalletJournal, loadWalletTransactionsWithStatus } from '@/features/character/wallet';
import { loadTypeNames } from '@/features/character/typeNames';
import { loadAllCharactersJournals } from '@/features/character/walletJournalAll';
import * as download from '@/lib/download';
import { usePlaceDetails } from '@/features/places';
import type { WalletJournalEntry, WalletTransaction } from '@/esi/endpoints';

vi.mock('@/features/character/wallet', () => ({
  loadWalletJournal: vi.fn(),
  loadWalletTransactionsWithStatus: vi.fn(),
}));
vi.mock('@/features/character/typeNames', () => ({ loadTypeNames: vi.fn() }));
vi.mock('@/app/loginFlow', () => ({ beginEveLogin: vi.fn() }));
vi.mock('@/features/character/walletJournalAll', () => ({ loadAllCharactersJournals: vi.fn() }));

vi.mock('@/features/places', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/places')>()),
  usePlaceDetails: vi.fn(() => new Map()),
}));

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

function renderPanel(url = '/market/history') {
  const actions = fakeItemActions();
  render(
    <MemoryRouter initialEntries={[url]}>
      <FakeItemActions actions={actions}>
        <WithPageHeaderSlots>
          {(slots) => <TransactionsPanel headerSlots={slots} />}
        </WithPageHeaderSlots>
      </FakeItemActions>
      <LocationProbe />
    </MemoryRouter>
  );
  return { actions };
}

beforeEach(() => {
  vi.clearAllMocks();
  useActiveCharacter.setState({ activeCharacterId: 1, hydrated: true });
  useVisibleTransactionsColumns.setState({ value: DEFAULT_VISIBLE_TRANSACTIONS_COLUMNS });
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

describe('TransactionsPanel — page header controls', () => {
  it('puts Refresh, Export and the data age in the page header, not a title bar of its own', async () => {
    mockTransactions({
      data: [transaction()],
      fetchedAt: new Date(),
      fromCache: false,
      truncated: false,
    });
    renderPanel();

    const header = screen.getByRole('banner');
    expect(
      await within(header).findByRole('button', { name: 'Export Transactions' })
    ).toBeInTheDocument();
    expect(within(header).getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
    expect(header.querySelector('time')).not.toBeNull();
    // The table's card has no header strip left.
    const table = screen.getByRole('table', { name: 'Transactions' });
    expect(table.closest('.rounded-xs')?.querySelector('header')).toBeNull();
  });

  describe('with two Characters', () => {
    beforeEach(async () => {
      await db.characters.clear();
      await db.characters.bulkPut([
        { characterId: 1, name: 'Pilot One', ownerHash: 'oh1', addedAt: 1 },
        { characterId: 2, name: 'Pilot Two', ownerHash: 'oh2', addedAt: 2 },
      ]);
    });
    afterEach(async () => {
      await db.characters.clear();
    });

    it('puts the Character picker in the page header, not the table toolbar', async () => {
      mockTransactions({
        data: [transaction()],
        fetchedAt: new Date(),
        fromCache: false,
        truncated: false,
      });
      renderPanel();

      const header = screen.getByRole('banner');
      const picker = await within(header).findByRole('button', { name: 'This character' });
      // The header's touch tier reaches through the portal (re-provided context), not the panel's sm.
      expect(picker).toHaveClass('h-11', 'md:h-9');
      expect(picker).not.toHaveClass('md:h-7');
      expect(screen.getAllByRole('button', { name: 'This character' })).toHaveLength(1);
    });

    it('names a Character "All" leaves out (no wallet grant) in the picker', async () => {
      vi.mocked(loadAllCharactersJournals).mockResolvedValue({
        loaded: [
          {
            characterId: 1,
            name: 'Pilot One',
            transactions: [transaction()],
            journal: [],
            fillsTruncated: false,
          },
        ],
        skipped: [{ characterId: 2, name: 'Pilot Two' }],
        typeNames: TYPE_NAMES,
      } as never);
      renderPanel('/market/history?txn.chars=all');

      expect(
        await within(screen.getByRole('banner')).findByRole('button', {
          name: /^All characters · 2\. Not included: Pilot Two$/,
        })
      ).toBeInTheDocument();
    });

    it('keeps the picker in the header when the read fails, so the pilot can switch scope', async () => {
      mockedLoadTransactions.mockRejectedValue(new Error('boom'));
      renderPanel();

      expect(await screen.findByText('Could not load')).toBeInTheDocument();
      expect(
        within(screen.getByRole('banner')).getByRole('button', { name: 'This character' })
      ).toBeInTheDocument();
    });
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
    renderPanel('/market/history?txn.side=buy');

    expect(await screen.findByRole('row', { name: /Tritanium/ })).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /Damage Control II/ })).not.toBeInTheDocument();
  });

  it('narrows the rows by date range from the URL', async () => {
    load(FILLS);
    renderPanel('/market/history?txn.start=2026-09-15');

    expect(await screen.findByRole('row', { name: /Damage Control II/ })).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /Tritanium/ })).not.toBeInTheDocument();
  });

  it('says so when the filter matches nothing, rather than showing a blank table', async () => {
    load(FILLS);
    renderPanel('/market/history?txn.q=nothing-like-this');

    expect(await screen.findByText('No transactions match this filter.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Totals for the transactions shown' })).toBeNull();
  });

  it('resets a URL-seeded filter that matches nothing, bringing the rows back', async () => {
    load(FILLS);
    renderPanel('/market/history?txn.start=2026-09-25');
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
    renderPanel('/market/history?txn.side=buy');
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
  // Margin is off by default; these tests are about what it says once ticked.
  beforeEach(() => {
    useVisibleTransactionsColumns.setState({ value: TRANSACTIONS_COLUMN_IDS });
  });

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

  it('says no wallet buy covers a sale, never showing a zero-cost margin', async () => {
    load([taxFor(2, -49_766.4), taxFor(3, -100)]);
    renderPanel();
    const row = await screen.findByRole('row', { name: /Tritanium/ });
    expect(marginCell(row)).toHaveTextContent('No wallet buy covers it');
  });

  it('says no sales tax line was found when the journal did not load, rather than a tax-free margin', async () => {
    load(null);
    renderPanel();
    const row = await screen.findByRole('row', { name: /Damage Control II.*Sell/ });
    expect(marginCell(row)).toHaveTextContent('No sales tax line found');
  });

  it('shows Margin % and Unit cost off the same working as the margin', async () => {
    load([taxFor(2, -49_766.4), taxFor(3, -100)]);
    renderPanel();
    const row = await screen.findByRole('row', { name: /Damage Control II.*Sell/ });
    // 132,633.6 over 3 × 400,000
    expect(row.querySelector('td[data-label="Margin %"]')).toHaveTextContent('11.1%');
    expect(row.querySelector('td[data-label="Unit cost"]')).toHaveTextContent('400,000');
    const noBuy = await screen.findByRole('row', { name: /Tritanium/ });
    expect(noBuy.querySelector('td[data-label="Margin %"]')).toHaveTextContent('—');
  });

  it('totals the sales without a margin under the figures', async () => {
    load([taxFor(2, -49_766.4), taxFor(3, -100)]);
    renderPanel();
    const strip = await screen.findByRole('region', { name: /Totals/ });
    // Only the built Tritanium sale has no margin.
    expect(strip).toHaveTextContent('1 sale uncosted ·');
  });

  it('omits the uncosted line when every sale has a margin', async () => {
    mockTransactions({
      data: [BUY, SALE],
      fetchedAt: new Date(),
      fromCache: false,
      truncated: false,
    });
    mockedLoadJournal.mockResolvedValue({
      data: [taxFor(2, -49_766.4)],
      fetchedAt: new Date(),
      fromCache: false,
      truncated: false,
    });
    renderPanel();
    const strip = await screen.findByRole('region', { name: /Totals/ });
    expect(strip).not.toHaveTextContent('uncosted');
  });

  it('leaves Margin out of the totals when no sale has one', async () => {
    load(null);
    renderPanel();
    const strip = await screen.findByRole('region', { name: /Totals/ });
    expect(within(strip).getByText('Net')).toBeInTheDocument();
    expect(within(strip).queryByText('Margin')).not.toBeInTheDocument();
  });

  it('totals the margin of the matched sales and the broker fees over the same dates', async () => {
    load([
      taxFor(2, -49_766.4),
      taxFor(3, -100),
      {
        id: 777,
        date: '2026-09-15T12:00:00Z',
        ref_type: 'brokers_fee',
        description: '',
        amount: -8_104_550,
      },
    ]);
    renderPanel('/market/history?txn.start=2026-09-01');
    const strip = await screen.findByRole('region', { name: /Totals/ });
    expect(strip).toHaveTextContent('+132,634');
    expect(strip).toHaveTextContent('1 of 2 sales matched');
    expect(strip).toHaveTextContent('-8,104,550');
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

  it('stays a plain table with a Sold / Bought / Net strip, shedding side (date is the default sort: it stays)', async () => {
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
    // Side starts unticked on a phone, so it isn't rendered at all.
    expect(row.querySelector('td[data-label="Side"]')).toBeNull();
    expect(row.querySelector('td[data-label="Date"]')).not.toHaveClass('max-sm:hidden');
    // Date over time: the date and the time are separate block spans below `sm`.
    expect(row.querySelectorAll('td[data-label="Date"] span.max-sm\\:block')).toHaveLength(2);
    expect(row.querySelector('td[data-label="Margin"]')).toBeNull();
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
      <MemoryRouter initialEntries={['/market/history?highlight=2048']}>
        <FakeItemActions>
          <WithPageHeaderSlots>
            {(slots) => <TransactionsPanel headerSlots={slots} />}
          </WithPageHeaderSlots>
        </FakeItemActions>
      </MemoryRouter>
    );
    const link = await screen.findByRole('link', { name: 'Damage Control II' });
    const row = link.closest('[data-row-key]');
    expect(row).toHaveAttribute('data-row-key', '7');
    expect(row).toHaveClass('row-pulse');
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });
});

describe('TransactionsPanel — column picker', () => {
  it('opens without Margin, and ticking it in the Columns menu shows it', async () => {
    mockTransactions({
      data: [transaction()],
      fetchedAt: new Date(),
      fromCache: false,
      truncated: false,
    });
    renderPanel();

    await screen.findByRole('link', { name: 'Damage Control II' });
    expect(screen.queryByRole('columnheader', { name: /Margin/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Columns' }));
    await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Margin' }));
    await userEvent.keyboard('{Escape}');

    expect(await screen.findByRole('columnheader', { name: /Margin/ })).toBeInTheDocument();
  });
});

describe('TransactionsPanel — location column', () => {
  it('stays off until ticked, then names the place and falls back to its id', async () => {
    mockTransactions({
      data: [transaction({ location_id: 60003760 })],
      fetchedAt: new Date(),
      fromCache: false,
      truncated: false,
    });
    vi.mocked(usePlaceDetails).mockImplementation((refs) =>
      refs.length > 0
        ? new Map([
            [
              '1:60003760',
              { name: 'Jita IV - Moon 4', systemId: null, security: null, jumps: undefined },
            ],
          ])
        : new Map()
    );
    renderPanel();

    await screen.findByRole('link', { name: 'Damage Control II' });
    expect(screen.queryByText('Jita IV - Moon 4')).not.toBeInTheDocument();
    // Nothing is asked for while the column is off.
    expect(vi.mocked(usePlaceDetails).mock.calls.every(([refs]) => refs.length === 0)).toBe(true);

    await userEvent.click(screen.getByRole('button', { name: 'Columns' }));
    await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Location' }));
    await userEvent.keyboard('{Escape}');

    expect(await screen.findByRole('link', { name: 'Jita IV - Moon 4' })).toBeInTheDocument();
  });
});
