import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { NARROW_QUERY } from '@/lib/useIsNarrow';
import { db } from '@/db';
import { STALE_FETCHED_AT } from '@/esi/cacheFixtures';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { useDefaultCharacterFilter } from '@/features/character/defaultCharacterFilter';
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

const journalPage1 = [
  {
    id: 1,
    date: '2026-08-02T00:00:00Z',
    ref_type: 'bounty_prize',
    description: 'Bounty',
    amount: 1000,
    balance: 5000,
  },
];
const journalPage2 = [
  {
    id: 2,
    date: '2026-08-01T00:00:00Z',
    ref_type: 'player_donation',
    description: 'Donation',
    amount: -500,
    balance: 4000,
  },
];

const loyaltyPayload = [
  { corporation_id: 1000167, loyalty_points: 5000 },
  { corporation_id: 1000419, loyalty_points: 250 }, // Paragon — EverMarks
];

const server = setupServer(
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/wallet`, () => HttpResponse.json(4500)),
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/wallet/journal`, ({ request }) => {
    const page = new URL(request.url).searchParams.get('page');
    return HttpResponse.json(page === '2' ? journalPage2 : journalPage1, {
      headers: { 'X-Pages': '2' },
    });
  }),
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/loyalty/points`, () =>
    HttpResponse.json(loyaltyPayload)
  ),
  http.post('https://esi.evetech.net/universe/names', () =>
    HttpResponse.json([{ id: 1000167, name: 'Caldari Navy', category: 'corporation' }])
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
  useDefaultCharacterFilter.setState({ value: 'current', hydrated: false });

  await db.characters.put({ characterId: CHAR_ID, name: 'Pilot One', ownerHash: 'oh', addedAt: 1 });
  await db.tokens.put({
    characterId: CHAR_ID,
    accessToken: 'access-token',
    refreshToken: 'refresh',
    expiresAt: Date.now() + 3_600_000,
    scopes: ['esi-wallet.read_character_wallet.v1', 'esi-characters.read_loyalty.v1'],
  });
  await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: CHAR_ID });
  window.history.pushState({}, '', '/wallet');
});

describe('Wallet', () => {
  it('shows the balance tab by default, from mocked ESI', async () => {
    render(<App />);
    expect(await screen.findByText(/4,500\.00/)).toBeInTheDocument();
  });

  it('shows EverMarks (Paragon LP) alongside ISK, and other loyalty points in a table below', async () => {
    render(<App />);
    expect(await screen.findByText(/4,500\.00/)).toBeInTheDocument();
    expect(screen.getByText('250')).toBeInTheDocument();
    expect(screen.getByText('Caldari Navy')).toBeInTheDocument();
    expect(screen.getByText('5,000')).toBeInTheDocument();
    // The Paragon corp itself doesn't also show up as a loyalty-table row.
    expect(screen.queryByText('#1000419')).not.toBeInTheDocument();
  });

  it('explains EverMarks with an info tooltip beside the label', async () => {
    render(<App />);
    const label = await screen.findByText('EverMarks');
    // The glyph is a sibling of the label text, not a tooltip parked elsewhere
    // on the panel — that adjacency is the whole point of the affordance.
    const trigger = within(label.closest('p') as HTMLElement).getByRole('button', {
      name: 'About EverMarks',
    });

    fireEvent.pointerMove(trigger);

    // Radix's first hover in a session goes through its own open delay
    // (zeroed, but still a real timer), so this waits rather than reads.
    expect(await screen.findByRole('tooltip')).toHaveTextContent(/Paragon corporation/);
  });

  it('shows the empty state under Loyalty Points when there is no non-EverMarks LP', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/loyalty/points`, () =>
        HttpResponse.json([{ corporation_id: 1000419, loyalty_points: 250 }])
      )
    );
    render(<App />);
    expect(await screen.findByText('250')).toBeInTheDocument();
    expect(screen.getByText(/no loyalty points cached/i)).toBeInTheDocument();
  });

  it('shows a re-login prompt under Loyalty Points (not the wallet reauth) when the loyalty scope was revoked', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/loyalty/points`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      )
    );
    render(<App />);
    expect(await screen.findByText(/4,500\.00/)).toBeInTheDocument();
    expect(screen.getByText('Log in again to see your loyalty points')).toBeInTheDocument();
    expect(screen.queryByText('Log in again to see your wallet')).not.toBeInTheDocument();
  });

  it('shows the journal, concatenating every page, newest first', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Journal' }));
    const rows = await screen.findAllByRole('row');
    // header + 2 entries, newest (2026-08-02) first
    expect(rows).toHaveLength(3);
    expect(screen.getByText('Bounty')).toBeInTheDocument();
    expect(screen.getByText('Donation')).toBeInTheDocument();
  });

  it('opens straight to the journal tab when a walletBalanceChanged notification deep-links here', async () => {
    window.history.pushState({}, '', '/wallet?tab=journal');
    render(<App />);
    expect(await screen.findByText('Bounty')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Journal' })).toHaveAttribute('aria-selected', 'true');
  });

  it('scrolls to and pulses the journal line a wallet alert pointed at', async () => {
    const scrollIntoView = vi
      .spyOn(Element.prototype, 'scrollIntoView')
      .mockImplementation(() => {});
    window.history.pushState({}, '', '/wallet?tab=journal&highlight=2');
    render(<App />);

    expect(await screen.findByText('Donation')).toBeInTheDocument();
    const pulsed = document.querySelector('[data-row-key="2"]');
    expect(pulsed?.className).toContain('row-pulse');
    // Only the line the alert was about.
    expect(document.querySelector('[data-row-key="1"]')?.className).not.toContain('row-pulse');
    expect(scrollIntoView.mock.instances).toContain(pulsed);

    // Spent on arrival, so a reload or a tab round-trip does not pulse again.
    await waitFor(() => {
      expect(new URLSearchParams(window.location.search).has('highlight')).toBe(false);
    });
    scrollIntoView.mockRestore();
  });

  /**
   * The corp ops board's vitals rail links a division balance straight here
   * (issue #419) — `?owner=corporation&division=` must open on the matching
   * division rather than landing on Personal with the params unused.
   */
  it('opens straight to a corporation division when the vitals rail’s link deep-links here', async () => {
    const CORPORATION_ID = 98000001;
    await db.characters.put({
      characterId: CHAR_ID,
      name: 'Pilot One',
      ownerHash: 'oh',
      addedAt: 1,
      corporationId: CORPORATION_ID,
    });
    await db.tokens.put({
      characterId: CHAR_ID,
      accessToken: 'access-token',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 3_600_000,
      scopes: [
        'esi-wallet.read_character_wallet.v1',
        'esi-characters.read_loyalty.v1',
        'esi-characters.read_corporation_roles.v1',
        'esi-wallet.read_corporation_wallets.v1',
        'esi-corporations.read_divisions.v1',
      ],
    });
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/roles`, () =>
        HttpResponse.json({ roles: ['Accountant'] })
      ),
      http.get(`https://esi.evetech.net/corporations/${CORPORATION_ID}/wallets`, () =>
        HttpResponse.json([
          { division: 1, balance: 1_000_000 },
          { division: 3, balance: 250 },
        ])
      ),
      http.get(`https://esi.evetech.net/corporations/${CORPORATION_ID}/divisions`, () =>
        HttpResponse.json({ wallet: [{ division: 3, name: 'SRP' }] })
      )
    );

    window.history.pushState({}, '', '/wallet?owner=corporation&division=3');
    render(<App />);

    // The corp switch mounts as soon as `useCorpAccess` reaches `ready`, but
    // resolving `ready` now takes an extra render pass (granted scopes load,
    // then the roles fetch fires once the roles scope is confirmed present) —
    // one more hop than `findByRole` alone reliably waits out.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Corporation' })).toHaveAttribute(
        'aria-pressed',
        'true'
      )
    );
    expect(await screen.findByRole('combobox', { name: 'Wallet division' })).toHaveTextContent(
      'SRP'
    );
    expect(screen.getByText(/250\.00/)).toBeInTheDocument();
  });

  /**
   * ESI divisions are 1-7 — a `?division=0` (or any other out-of-range value)
   * must not reach `loadCorporationWalletJournal` as a division number, which
   * is what a bare `Number.isInteger` check would let through.
   */
  it('falls back to division 1 for an out-of-range ?division= deep link', async () => {
    const CORPORATION_ID = 98000001;
    await db.characters.put({
      characterId: CHAR_ID,
      name: 'Pilot One',
      ownerHash: 'oh',
      addedAt: 1,
      corporationId: CORPORATION_ID,
    });
    await db.tokens.put({
      characterId: CHAR_ID,
      accessToken: 'access-token',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 3_600_000,
      scopes: [
        'esi-wallet.read_character_wallet.v1',
        'esi-characters.read_loyalty.v1',
        'esi-characters.read_corporation_roles.v1',
        'esi-wallet.read_corporation_wallets.v1',
        'esi-corporations.read_divisions.v1',
      ],
    });
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/roles`, () =>
        HttpResponse.json({ roles: ['Accountant'] })
      ),
      http.get(`https://esi.evetech.net/corporations/${CORPORATION_ID}/wallets`, () =>
        HttpResponse.json([{ division: 1, balance: 1_000_000 }])
      ),
      http.get(`https://esi.evetech.net/corporations/${CORPORATION_ID}/divisions`, () =>
        HttpResponse.json({})
      )
    );

    window.history.pushState({}, '', '/wallet?owner=corporation&division=0');
    render(<App />);

    expect(await screen.findByRole('combobox', { name: 'Wallet division' })).toHaveTextContent(
      'Division 1'
    );
    expect(screen.getByText(/1,000,000\.00/)).toBeInTheDocument();
  });

  it('humanizes the raw ESI ref_type into readable text', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Journal' }));
    // Scoped to the table: the same humanized strings also populate the
    // ref-type filter's <option> list (issue #413).
    const table = await screen.findByRole('table', { name: 'Journal' });
    expect(await within(table).findByText('Bounty prize')).toBeInTheDocument();
    expect(within(table).getByText('Player donation')).toBeInTheDocument();
    expect(within(table).queryByText('bounty_prize')).not.toBeInTheDocument();
  });

  it('falls back to cached data when ESI is unreachable, showing the offline banner', async () => {
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: 'wallet:balance',
      value: 999,
      fetchedAt: STALE_FETCHED_AT,
    });
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/wallet`, () => HttpResponse.error())
    );
    render(<App />);
    expect(await screen.findByText(/999\.00/)).toBeInTheDocument();
    expect(screen.getByText(/showing cached data/i)).toBeInTheDocument();
  });

  it('warns that the journal is incomplete when a page fails mid-pagination (D4)', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/wallet/journal`, ({ request }) => {
        const page = new URL(request.url).searchParams.get('page');
        if (page === '2') return new HttpResponse(null, { status: 404 });
        return HttpResponse.json(journalPage1, { headers: { 'X-Pages': '2' } });
      })
    );
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Journal' }));
    expect(await screen.findByText('Bounty')).toBeInTheDocument();
    expect(screen.getByText(/incomplete data/i)).toBeInTheDocument();
  });

  it('shows no truncation warning when the journal came back whole', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Journal' }));
    expect(await screen.findByText('Bounty')).toBeInTheDocument();
    expect(screen.queryByText(/incomplete data/i)).not.toBeInTheDocument();
  });

  it('narrows the journal to rows matching the ref-type filter (issue #413)', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Journal' }));
    await screen.findByText('Bounty');

    await user.click(screen.getByRole('combobox', { name: 'Ref type' }));
    await user.click(await screen.findByRole('option', { name: 'Bounty prize' }));

    expect(screen.getByText('Bounty')).toBeInTheDocument();
    expect(screen.queryByText('Donation')).toBeNull();
  });

  it('narrows the journal by free text against the description (issue #413)', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Journal' }));
    await screen.findByText('Bounty');

    await user.type(screen.getByPlaceholderText('Search description…'), 'Donation');

    expect(screen.queryByText('Bounty')).toBeNull();
    expect(screen.getByText('Donation')).toBeInTheDocument();
  });

  it('shows a filtered-empty message, not the no-data empty state, when the filter matches nothing (issue #413)', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Journal' }));
    await screen.findByText('Bounty');

    await user.type(screen.getByPlaceholderText('Search description…'), 'nothing matches this');

    expect(await screen.findByText('No journal entries match this filter.')).toBeInTheDocument();
    expect(
      screen.getByText('Clear the search or reset the filters above to see every entry.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/reconnect to fetch/i)).not.toBeInTheDocument();
  });

  it('shows the empty state when there is no data at all', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/wallet`, () => HttpResponse.error())
    );
    render(<App />);
    expect(await screen.findByText(/no wallet data cached/i)).toBeInTheDocument();
  });

  it('distinguishes a failed manual Refresh from the initial-load offline banner (UX-REVIEW #10)', async () => {
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: 'wallet:balance',
      value: 999,
      fetchedAt: STALE_FETCHED_AT,
    });
    const user = userEvent.setup();
    render(<App />);

    // Initial load succeeds live — no banner at all yet.
    expect(await screen.findByText(/4,500\.00/)).toBeInTheDocument();
    expect(screen.queryByText(/showing cached data/i)).not.toBeInTheDocument();

    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/wallet`, () => HttpResponse.error())
    );
    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(await screen.findByText('Refresh failed — showing cached data')).toBeInTheDocument();
  });

  it('shows a re-login banner (not a silent offline empty state) on a 401 (BUG #3)', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/wallet`, () =>
        HttpResponse.json({ error: 'token invalid' }, { status: 401 })
      )
    );

    render(<App />);

    expect(await screen.findByRole('button', { name: /log in again/i })).toBeInTheDocument();
    expect(screen.queryByText(/no wallet data cached/i)).not.toBeInTheDocument();
    const { beginEveLogin } = await import('@/app/loginFlow');
    screen.getByRole('button', { name: /log in again/i }).click();
    expect(beginEveLogin).toHaveBeenCalled();
  });

  /**
   * Narrow, so the journal's filters render in the sheet rather than the row.
   * jsdom's `matchMedia` stub never matches, which `useIsNarrow` reads as a
   * pointer viewport.
   */
  function useNarrowViewport(): () => void {
    const real = window.matchMedia;
    window.matchMedia = (media: string) =>
      ({
        media,
        matches: media === NARROW_QUERY,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList;
    return () => {
      window.matchMedia = real;
    };
  }

  it('keeps the journal date range on one row inside the mobile filter sheet', async () => {
    const restore = useNarrowViewport();
    try {
      const user = userEvent.setup();
      render(<App />);
      await user.click(await screen.findByRole('tab', { name: 'Journal' }));
      await screen.findByText('Bounty');

      // The dates are behind the trigger now, with the search box left in the row.
      expect(screen.queryByLabelText(/^From$/)).toBeNull();
      await user.click(screen.getByRole('button', { name: /^Filters/ }));

      const dialog = screen.getByRole('dialog', { name: 'Filters' });
      const dates = within(dialog)
        .getAllByDisplayValue('')
        .filter((el) => el.getAttribute('type') === 'date');
      expect(dates).toHaveLength(2);
      // `DateRangeFields`' wrapper becomes a real row here rather than the
      // `display: contents` it carries inline — which is also the only proof
      // that `useFilterSurface` resolves to the sheet from inside the modal.
      const wrapper = dates[0]!.closest('div')!;
      expect(wrapper).toBe(dates[1]!.closest('div'));
      expect(wrapper).toHaveClass('flex');
      expect(wrapper).not.toHaveClass('contents');
    } finally {
      restore();
    }
  });
  /**
   * The corp Transactions tab (issue #570). Personal must not grow a third tab
   * — the character's fills are Market's — and the corp one must fetch, draw
   * and filter its division's own rows.
   */
  describe('corporation transactions', () => {
    const CORPORATION_ID = 98000001;

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

    async function seedCorpCharacter() {
      await db.characters.put({
        characterId: CHAR_ID,
        name: 'Pilot One',
        ownerHash: 'oh',
        addedAt: 1,
        corporationId: CORPORATION_ID,
      });
      await db.tokens.put({
        characterId: CHAR_ID,
        accessToken: 'access-token',
        refreshToken: 'refresh',
        expiresAt: Date.now() + 3_600_000,
        scopes: [
          'esi-wallet.read_character_wallet.v1',
          'esi-characters.read_loyalty.v1',
          'esi-characters.read_corporation_roles.v1',
          'esi-wallet.read_corporation_wallets.v1',
          'esi-corporations.read_divisions.v1',
        ],
      });
      server.use(
        http.get(`https://esi.evetech.net/characters/${CHAR_ID}/roles`, () =>
          HttpResponse.json({ roles: ['Accountant'] })
        ),
        http.get(`https://esi.evetech.net/corporations/${CORPORATION_ID}/wallets`, () =>
          HttpResponse.json([{ division: 1, balance: 1_000_000 }])
        ),
        http.get(`https://esi.evetech.net/corporations/${CORPORATION_ID}/divisions`, () =>
          HttpResponse.json({ wallet: [{ division: 1, name: 'Master Wallet' }] })
        ),
        http.get(
          `https://esi.evetech.net/corporations/${CORPORATION_ID}/wallets/1/transactions`,
          ({ request }) =>
            // The cursor is exclusive, so a second call must come back empty or
            // the walk would never stop.
            new URL(request.url).searchParams.has('from_id')
              ? HttpResponse.json([])
              : HttpResponse.json(corpTransactions)
        )
      );
    }

    it('is not offered for a personal wallet', async () => {
      render(<App />);
      expect(await screen.findByRole('tab', { name: 'Journal' })).toBeInTheDocument();
      expect(screen.queryByRole('tab', { name: 'Transactions' })).not.toBeInTheDocument();
    });

    it('lists a division’s fills, and filters them by side', async () => {
      const user = userEvent.setup();
      await seedCorpCharacter();

      window.history.pushState({}, '', '/wallet?owner=corporation&tab=transactions');
      render(<App />);

      const table = await screen.findByRole('table', { name: 'Transactions' });
      expect(await within(table).findByText('Tritanium')).toBeInTheDocument();
      expect(within(table).getByText('Pyerite')).toBeInTheDocument();

      await user.click(screen.getByRole('combobox', { name: 'Side' }));
      await user.click(await screen.findByRole('option', { name: 'Sell' }));

      expect(await within(table).findByText('Pyerite')).toBeInTheDocument();
      expect(within(table).queryByText('Tritanium')).not.toBeInTheDocument();
    });

    /**
     * The filter is per-visit view state, and "this division traded nothing"
     * is what a filter left over from another owner or division looks like.
     */
    it('drops the filter when the owner switches away and back', async () => {
      const user = userEvent.setup();
      await seedCorpCharacter();

      window.history.pushState({}, '', '/wallet?owner=corporation&tab=transactions');
      render(<App />);

      const search = await screen.findByPlaceholderText('Search item…');
      await user.type(search, 'Megacyte');
      expect(await screen.findByText('No transactions match this filter.')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Personal' }));
      // Scoped to the switch: the personal Balance tab it lands on also has a
      // sortable "Corporation" column header in the loyalty table.
      const ownerButton = (name: string) =>
        screen.getAllByRole('button', { name }).find((el) => el.hasAttribute('aria-pressed'))!;
      await user.click(ownerButton('Corporation'));

      // Back on the corp side, the tab is offered again and its filter is empty.
      await user.click(await screen.findByRole('tab', { name: 'Transactions' }));
      const table = await screen.findByRole('table', { name: 'Transactions' });
      expect(await within(table).findByText('Tritanium')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Search item…')).toHaveValue('');
    });

    it('says so when the filter, not the division, is why the table is empty', async () => {
      const user = userEvent.setup();
      await seedCorpCharacter();

      window.history.pushState({}, '', '/wallet?owner=corporation&tab=transactions');
      render(<App />);

      const search = await screen.findByPlaceholderText('Search item…');
      await user.type(search, 'Megacyte');

      expect(await screen.findByText('No transactions match this filter.')).toBeInTheDocument();
      expect(screen.queryByText('No corp transactions cached')).not.toBeInTheDocument();
    });
  });

  describe('cross-character balances (issue #607)', () => {
    const CHAR_B = 92;

    async function seedSecondCharacter() {
      await db.characters.put({
        characterId: CHAR_B,
        name: 'Pilot Two',
        ownerHash: 'oh2',
        addedAt: 2,
      });
      await db.tokens.put({
        characterId: CHAR_B,
        accessToken: 'access-token-b',
        refreshToken: 'refresh-b',
        expiresAt: Date.now() + 3_600_000,
        scopes: ['esi-wallet.read_character_wallet.v1'],
      });
      server.use(
        http.get(`https://esi.evetech.net/characters/${CHAR_B}/wallet`, () =>
          HttpResponse.json(1500)
        )
      );
    }

    it('renders no character filter for an account with one Character — nothing for it to change', async () => {
      // Deliberately no `seedSecondCharacter()`: the outer beforeEach leaves
      // exactly one pilot in Dexie.
      render(<App />);

      expect(await screen.findByText(/4,500\.00/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'This character' })).toBeNull();
    });

    it('puts the character filter in the balance panel header, and keeps it there across the panel swap', async () => {
      const user = userEvent.setup();
      await seedSecondCharacter();
      render(<App />);

      // In the panel's own title bar, not a bare row floating above it.
      await screen.findByText(/4,500\.00/);
      const balanceHeader = screen.getByRole('heading', { name: 'Balance' }).closest('header');
      expect(balanceHeader).not.toBeNull();
      await user.click(within(balanceHeader!).getByRole('button', { name: 'This character' }));
      await user.click(await screen.findByRole('button', { name: 'All characters' }));

      // The panel below swaps to the per-character table; the picker rides
      // along into that panel's header rather than being left behind.
      const wideHeader = (
        await screen.findByRole('heading', { name: 'Balance by character' })
      ).closest('header');
      expect(
        within(wideHeader!).getByRole('button', { name: 'All characters' })
      ).toBeInTheDocument();
    });

    it("shows only the active character's balance by default — no picker-driven fetch", async () => {
      await seedSecondCharacter();
      render(<App />);

      expect(await screen.findByText(/4,500\.00/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'This character' })).toBeInTheDocument();
      expect(screen.queryByText(/1,500\.00/)).not.toBeInTheDocument();
    });

    it('switching to "All characters" shows every character\'s balance and a total', async () => {
      const user = userEvent.setup();
      await seedSecondCharacter();
      render(<App />);

      await screen.findByText(/4,500\.00/);
      await user.click(screen.getByRole('button', { name: 'This character' }));
      await user.click(await screen.findByRole('button', { name: 'All characters' }));

      const table = await screen.findByRole('table', { name: 'Balance by character' });
      expect(await within(table).findByText('Pilot One')).toBeInTheDocument();
      expect(within(table).getByText('Pilot Two')).toBeInTheDocument();
      // 4,500.00 + 1,500.00 = 6,000.00 — the Total line, distinct from either row.
      expect(await screen.findByText(/6,000\.00/)).toBeInTheDocument();
    });

    it('opens on "All characters" when the synced default says so, without the pilot touching the picker', async () => {
      await seedSecondCharacter();
      await db.settings.put({ key: 'sync.defaultCharacterFilter', value: 'all' });
      render(<App />);

      expect(await screen.findByRole('button', { name: 'All characters' })).toBeInTheDocument();
      const table = await screen.findByRole('table', { name: 'Balance by character' });
      expect(await within(table).findByText('Pilot One')).toBeInTheDocument();
      expect(within(table).getByText('Pilot Two')).toBeInTheDocument();
    });

    it('only shows a "hasn\'t granted access" notice for a skipped character actually in the selected filter', async () => {
      const user = userEvent.setup();
      await seedSecondCharacter();
      const CHAR_C = 93;
      await db.characters.put({
        characterId: CHAR_C,
        name: 'Pilot Three',
        ownerHash: 'oh3',
        addedAt: 3,
      });
      // CHAR_C deliberately gets no token at all — never granted the scope.
      render(<App />);

      await screen.findByText(/4,500\.00/);
      await user.click(screen.getByRole('button', { name: 'This character' }));
      await user.click(await screen.findByRole('button', { name: 'All characters' }));

      // All three selected: Pilot Three's skipped notice shows.
      expect(
        await screen.findByText(/Pilot Three.*hasn't granted wallet access/)
      ).toBeInTheDocument();

      // Narrow the filter to exclude Pilot Three — its notice must go with
      // it, even though it's still a real skipped character overall (issue
      // #607 CodeRabbit review: the notice list must follow the same filter
      // the balance rows do).
      await user.click(screen.getByRole('button', { name: 'All characters' }));
      await user.click(screen.getByRole('option', { name: 'Pilot Three' }));
      await user.keyboard('{Escape}');

      expect(
        screen.queryByText(/Pilot Three.*hasn't granted wallet access/)
      ).not.toBeInTheDocument();
      const table = screen.getByRole('table', { name: 'Balance by character' });
      expect(within(table).getByText('Pilot One')).toBeInTheDocument();
      expect(within(table).getByText('Pilot Two')).toBeInTheDocument();
    });
  });
});
