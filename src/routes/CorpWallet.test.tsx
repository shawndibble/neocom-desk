/**
 * `/corp/wallet` — the corporation's wallet, one division at a time (issues
 * #298, #570). It was the Corporation side of a switch on `/wallet` until it
 * moved into the Corp section; the last block pins that `/wallet` itself no
 * longer offers it, and that links from then still arrive here.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { db } from '@/db';
import * as download from '@/lib/download';
import { corpCacheKey } from '@/esi/cache';
import { scopesForGroup } from '@/esi/scopes';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { App } from '@/app/App';
import type { TypeMap } from '@/sde/types';

vi.mock('@/app/loginFlow', () => ({ beginEveLogin: vi.fn().mockResolvedValue(undefined) }));

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}));

const TYPES: TypeMap = {
  '34': { name: 'Tritanium', groupID: 18, volume: 0.01 },
  '35': { name: 'Pyerite', groupID: 18, volume: 0.01 },
};

vi.mock('@/sde/loadSde', () => ({
  loadSkills: vi.fn(async () => []),
  loadTypes: vi.fn(async () => TYPES),
  loadBlueprints: vi.fn(async () => ({})),
  loadPi: vi.fn(async () => ({ schematics: {}, raw: [] })),
  loadMarketWideTrees: vi.fn(async () => ({})),
}));

const CHAR_ID = 91;
const CORP_ID = 98000001;
const BASE = 'https://esi.evetech.net';

const personalJournal = [
  {
    id: 1,
    date: '2026-08-02T00:00:00Z',
    ref_type: 'bounty_prize',
    description: 'My bounty',
    amount: 1000,
    balance: 5000,
  },
];

const corpJournalByDivision: Record<number, unknown[]> = {
  1: [
    {
      id: 11,
      date: '2026-08-03T00:00:00Z',
      ref_type: 'corporate_reward_payout',
      description: 'Master division payout',
      amount: 900,
      balance: 1000000,
    },
  ],
  2: [
    {
      id: 22,
      date: '2026-08-04T00:00:00Z',
      ref_type: 'insurance',
      description: 'SRP division payout',
      amount: 50,
      balance: 250,
    },
  ],
};

const corpTransactions = [
  {
    transaction_id: 5001,
    date: '2026-08-04T10:00:00Z',
    location_id: 60003760,
    type_id: 34,
    unit_price: 5,
    quantity: 1000,
    client_id: 90000001,
    is_buy: true,
    journal_ref_id: 7001,
  },
  {
    transaction_id: 5002,
    date: '2026-08-05T10:00:00Z',
    location_id: 60003760,
    type_id: 35,
    unit_price: 9,
    quantity: 2000,
    client_id: 90000002,
    is_buy: false,
    journal_ref_id: 7002,
  },
];

const server = setupServer(
  http.get(`${BASE}/characters/${CHAR_ID}/wallet`, () => HttpResponse.json(4500)),
  http.get(`${BASE}/characters/${CHAR_ID}/wallet/journal`, () =>
    HttpResponse.json(personalJournal)
  ),
  http.get(`${BASE}/characters/${CHAR_ID}/loyalty/points`, () => HttpResponse.json([])),
  http.post(`${BASE}/universe/names`, () => HttpResponse.json([])),
  http.get(`${BASE}/characters/${CHAR_ID}/roles`, () => HttpResponse.json({ roles: ['Director'] })),
  http.get(`${BASE}/corporations/${CORP_ID}/wallets`, () =>
    HttpResponse.json([
      { division: 2, balance: 250 },
      { division: 1, balance: 1000000 },
    ])
  ),
  http.get(`${BASE}/corporations/${CORP_ID}/divisions`, () =>
    HttpResponse.json({
      wallet: [
        { division: 1, name: 'Master Wallet' },
        { division: 2, name: 'SRP' },
      ],
    })
  ),
  http.get(`${BASE}/corporations/${CORP_ID}/wallets/:division/journal`, ({ params }) =>
    HttpResponse.json(corpJournalByDivision[Number(params.division)] ?? [])
  ),
  http.get(
    `${BASE}/corporations/${CORP_ID}/wallets/:division/transactions`,
    ({ params, request }) =>
      // The cursor is exclusive, so a second call must come back empty or the
      // walk would never stop. Only the master division has traded.
      new URL(request.url).searchParams.has('from_id') || Number(params.division) !== 1
        ? HttpResponse.json([])
        : HttpResponse.json(corpTransactions)
  )
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());
beforeEach(async () => {
  await db.characters.clear();
  await db.tokens.clear();
  await db.settings.clear();
  await db.esiCache.clear();
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
  usePublicInfo.setState({ byCharacterId: {} });

  await db.characters.put({
    characterId: CHAR_ID,
    name: 'Pilot One',
    ownerHash: 'oh',
    addedAt: 1,
    corporationId: CORP_ID,
  });
  await db.tokens.put({
    characterId: CHAR_ID,
    accessToken: 'access-token',
    refreshToken: 'refresh',
    expiresAt: Date.now() + 3_600_000,
    scopes: [
      'esi-wallet.read_character_wallet.v1',
      'esi-characters.read_loyalty.v1',
      ...scopesForGroup('corp'),
    ],
  });
  await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: CHAR_ID });
  window.history.pushState({}, '', '/corp/wallet');
});

/** The division selector, once the roles, scopes and balances have all resolved. */
function findDivisionSelect() {
  return screen.findByRole('combobox', { name: 'Wallet division' });
}

/** The journal panel's title-bar ⋯ › Export table › Download CSV (jsdom has no hover intent). */
async function exportJournalCsv(user: ReturnType<typeof userEvent.setup>) {
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Journal actions' }), {
    button: 0,
    pointerType: 'mouse',
  });
  (await screen.findByRole('menuitem', { name: 'Export table' })).focus();
  await user.keyboard('{ArrowRight}');
  (await screen.findByRole('menuitem', { name: 'Download CSV' })).focus();
  await user.keyboard('{Enter}');
}

describe('Corp Wallet: the gate', () => {
  it('explains the missing role, and reads no wallet, for a Character with no wallet role', async () => {
    server.use(
      http.get(`${BASE}/characters/${CHAR_ID}/roles`, () =>
        HttpResponse.json({ roles: ['Station_Manager'] })
      )
    );

    render(<App />);

    expect(await screen.findByText('Corp wallet needs Accountant')).toBeInTheDocument();
    expect(screen.queryByLabelText('Wallet division')).toBeNull();
  });

  it('is an entry in the Corp section nav for a Character who can read the wallet', async () => {
    render(<App />);
    await findDivisionSelect();

    const nav = screen.getByRole('navigation', { name: 'Corporation' });
    expect(within(nav).getByRole('link', { name: 'Wallet' })).toHaveAttribute(
      'href',
      '/corp/wallet'
    );
  });
});

describe('Corp Wallet: balances, journal and divisions (AC 2, AC 3)', () => {
  it('shows the selected division balance, named from read_divisions', async () => {
    render(<App />);

    // Scoped to the balance heading: the same name is also the division
    // selector's value.
    expect(await screen.findByText('Master Wallet', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText(/1,000,000\.00/)).toBeInTheDocument();
    // The Character's own balance and EverMarks are not on this page.
    expect(screen.queryByText(/4,500\.00/)).toBeNull();
    expect(screen.queryByText('EverMarks')).toBeNull();
  });

  it('switches division, and the journal below follows it', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/1,000,000\.00/);

    await user.click(screen.getByRole('tab', { name: 'Journal' }));
    expect(await screen.findByText('Master division payout')).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: 'Wallet division' }));
    await user.click(await screen.findByRole('option', { name: 'SRP' }));

    expect(await screen.findByText('SRP division payout')).toBeInTheDocument();
    expect(screen.queryByText('Master division payout')).toBeNull();
    // The same journal table `/wallet` draws. Scoped to the table: "Insurance"
    // also names an <option> in the ref-type filter (issue #413).
    const table = screen.getByRole('table', { name: 'Journal' });
    expect(within(table).getByText('Insurance')).toBeInTheDocument();
    // Never the Character's own journal.
    expect(screen.queryByText('My bounty')).toBeNull();
  });

  it('does not re-page the journal when the tab is toggled away and back (issue #413)', async () => {
    let journalRequests = 0;
    server.use(
      http.get(`${BASE}/corporations/${CORP_ID}/wallets/:division/journal`, ({ params }) => {
        journalRequests += 1;
        return HttpResponse.json(corpJournalByDivision[Number(params.division)] ?? []);
      })
    );
    const user = userEvent.setup();
    render(<App />);
    await findDivisionSelect();

    await user.click(screen.getByRole('tab', { name: 'Journal' }));
    expect(await screen.findByText('Master division payout')).toBeInTheDocument();
    expect(journalRequests).toBe(1);

    await user.click(screen.getByRole('tab', { name: 'Balance' }));
    await screen.findByText('Master Wallet', { selector: 'p' });
    await user.click(screen.getByRole('tab', { name: 'Journal' }));

    expect(await screen.findByText('Master division payout')).toBeInTheDocument();
    expect(journalRequests).toBe(1);
  });

  it('names the journal CSV export after the division, so exporting two divisions never overwrites the same file (issue #413)', async () => {
    const spy = vi.spyOn(download, 'downloadTextFile').mockImplementation(() => {});
    const user = userEvent.setup();
    window.history.pushState({}, '', '/corp/wallet/journal');
    render(<App />);
    await screen.findByText('Master division payout');

    await exportJournalCsv(user);
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(spy.mock.calls[0][0]).toMatch(
      /^neocom-corp-wallet-journal-master-wallet-\d{4}-\d{2}-\d{2}\.csv$/
    );

    await user.click(screen.getByRole('combobox', { name: 'Wallet division' }));
    await user.click(await screen.findByRole('option', { name: 'SRP' }));
    await screen.findByText('SRP division payout');

    await exportJournalCsv(user);
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    expect(spy.mock.calls[1][0]).toMatch(/^neocom-corp-wallet-journal-srp-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  it('dates the balances by their own cached fetch time', async () => {
    const corpFetchedAt = Date.now() - 5 * 60_000;
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: corpCacheKey(CORP_ID, 'wallet:balances'),
      value: [{ division: 1, balance: 1000000 }],
      fetchedAt: corpFetchedAt,
    });
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: corpCacheKey(CORP_ID, 'divisions'),
      value: { wallet: [{ division: 1, name: 'Master Wallet' }] },
      fetchedAt: corpFetchedAt,
    });
    const { container } = render(<App />);
    await screen.findByText('Master Wallet', { selector: 'p' });

    expect(container.querySelector('section header time')?.getAttribute('dateTime')).toBe(
      new Date(corpFetchedAt).toISOString()
    );
  });

  it('shows a distinct failed-load state for the journal, not the "no entries" empty state (issue #413)', async () => {
    server.use(
      http.get(`${BASE}/corporations/${CORP_ID}/wallets/:division/journal`, () =>
        HttpResponse.error()
      )
    );
    window.history.pushState({}, '', '/corp/wallet/journal');
    render(<App />);

    expect(await screen.findByText('Could not load')).toBeInTheDocument();
    expect(screen.queryByText('No corp journal entries cached')).toBeNull();
  });

  /** A 403 here is the in-game role gate; a re-login button over it would be a lie. */
  it('does not offer a re-login over the corp role gate (403)', async () => {
    server.use(
      http.get(`${BASE}/corporations/${CORP_ID}/wallets`, () =>
        HttpResponse.json({ error: 'Forbidden' }, { status: 403 })
      ),
      http.get(`${BASE}/corporations/${CORP_ID}/divisions`, () =>
        HttpResponse.json({ error: 'Forbidden' }, { status: 403 })
      )
    );
    render(<App />);

    expect(
      await screen.findByText('No corporation wallet data cached. Reconnect to fetch it.')
    ).toBeInTheDocument();
    expect(screen.queryByText('Log in again to see your wallet')).toBeNull();
  });

  it('opens straight to the division a ?division= deep link names (issue #419)', async () => {
    window.history.pushState({}, '', '/corp/wallet/balance?division=2');
    render(<App />);

    expect(await findDivisionSelect()).toHaveTextContent('SRP');
    expect(screen.getByText(/250\.00/)).toBeInTheDocument();
  });

  /**
   * ESI divisions are 1-7 — a `?division=0` (or any other out-of-range value)
   * must not reach `loadCorporationWalletJournal` as a division number, which
   * is what a bare `Number.isInteger` check would let through.
   */
  it('falls back to the first division for an out-of-range ?division= deep link', async () => {
    window.history.pushState({}, '', '/corp/wallet/balance?division=0');
    render(<App />);

    expect(await findDivisionSelect()).toHaveTextContent('Master Wallet');
    expect(screen.getByText(/1,000,000\.00/)).toBeInTheDocument();
  });
});

describe('Wallet no longer carries the corporation', () => {
  it('offers no owner switch, division selector or Transactions tab on /wallet, even to a corp wallet reader', async () => {
    window.history.pushState({}, '', '/wallet');
    render(<App />);
    expect(await screen.findByText(/4,500\.00/)).toBeInTheDocument();
    // The switch used to appear only once corp access resolved to `ready`,
    // which is also what puts Corp in the sidebar.
    expect(await screen.findByRole('link', { name: 'Corporation' })).toBeInTheDocument();

    expect(screen.queryByRole('group', { name: 'Wallet owner' })).toBeNull();
    expect(screen.queryByLabelText('Wallet division')).toBeNull();
    expect(screen.queryByRole('tab', { name: /transactions/i })).toBeNull();
  });

  /** The old vitals-rail link, and any bookmark of the Corporation side (issue #419). */
  it('sends a /wallet?owner=corporation link on to the same division and tab on /corp/wallet', async () => {
    window.history.pushState({}, '', '/wallet/journal?owner=corporation&division=2');
    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe('/corp/wallet/journal'));
    expect(window.location.search).toBe('?division=2');
    expect(await screen.findByText('SRP division payout')).toBeInTheDocument();
  });
});

/**
 * The Transactions tab (issue #570): fetch, draw and filter the selected
 * division's own fills.
 */
describe('Corp Wallet: transactions', () => {
  it('lists a division’s fills, and filters them by side', async () => {
    const user = userEvent.setup();
    window.history.pushState({}, '', '/corp/wallet/transactions');
    render(<App />);

    const table = await screen.findByRole('table', { name: 'Transactions' });
    expect(await within(table).findByText('Tritanium')).toBeInTheDocument();
    expect(within(table).getByText('Pyerite')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    await user.click(screen.getByRole('combobox', { name: 'Side' }));
    await user.click(await screen.findByRole('option', { name: 'Sell' }));

    expect(await within(table).findByText('Pyerite')).toBeInTheDocument();
    expect(within(table).queryByText('Tritanium')).not.toBeInTheDocument();
  });

  /**
   * The filter lives in the URL (issue #1302). Corp access and the division
   * list resolve a render or two after mount, and the reset-on-scope-change
   * effect must not mistake that settling for a real division change — or a
   * reload of a link carrying a transaction filter would wipe it the instant
   * they finished loading.
   */
  it('keeps a transaction filter carried in the URL, even while corp access is still resolving', async () => {
    window.history.pushState({}, '', '/corp/wallet/transactions?txn.q=Pyerite');
    render(<App />);

    const table = await screen.findByRole('table', { name: 'Transactions' });
    expect(await within(table).findByText('Pyerite')).toBeInTheDocument();
    expect(within(table).queryByText('Tritanium')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search item…')).toHaveValue('Pyerite');
  });

  /**
   * The filter still resets on a division switch: "this division traded
   * nothing" is what a filter left over from another division looks like.
   */
  it('drops the filter when the division switches away and back', async () => {
    const user = userEvent.setup();
    window.history.pushState({}, '', '/corp/wallet/transactions');
    render(<App />);

    const search = await screen.findByPlaceholderText('Search item…');
    await user.type(search, 'Megacyte');
    expect(await screen.findByText('No transactions match this filter.')).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: 'Wallet division' }));
    await user.click(await screen.findByRole('option', { name: 'SRP' }));
    await user.click(screen.getByRole('combobox', { name: 'Wallet division' }));
    await user.click(await screen.findByRole('option', { name: 'Master Wallet' }));

    const table = await screen.findByRole('table', { name: 'Transactions' });
    expect(await within(table).findByText('Tritanium')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search item…')).toHaveValue('');
  });

  it('says so when the filter, not the division, is why the table is empty', async () => {
    const user = userEvent.setup();
    window.history.pushState({}, '', '/corp/wallet/transactions');
    render(<App />);

    const search = await screen.findByPlaceholderText('Search item…');
    await user.type(search, 'Megacyte');

    expect(await screen.findByText('No transactions match this filter.')).toBeInTheDocument();
    expect(screen.queryByText('No corp transactions cached')).not.toBeInTheDocument();
  });
});
