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
import * as routeChunks from '@/app/routeChunks';
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
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/wallet/transactions`, () =>
    HttpResponse.json([])
  ),
  http.post('https://esi.evetech.net/universe/names', () =>
    HttpResponse.json([{ id: 1000167, name: 'Caldari Navy', category: 'corporation' }])
  )
);

beforeAll(async () => {
  server.listen({ onUnhandledRequest: 'error' });
  // One throwaway render, so no test pays for the first one. A worker's first
  // `App` render (compiling the lazy Layout and route chunks, warming jsdom
  // and React) took seconds under parallel load and landed on whichever test
  // ran first, tipping it past its findBy / test timeout. Done here under the
  // hook's own budget, as IndustryPlanPage.test.tsx does.
  await Promise.all([routeChunks.loadLayout(), routeChunks.loadWallet()]);
  await seed();
  const { unmount } = render(<App />);
  // Wait for real content, not just the shell: the first data load (Dexie, MSW,
  // the ESI cache) is part of the cold cost too.
  await screen.findByText(/4,500\.00/, {}, { timeout: 25_000 });
  unmount();
  server.resetHandlers();
}, 30_000);
afterAll(() => server.close());
afterEach(() => server.resetHandlers());
async function seed() {
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
}

beforeEach(seed);

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

  it("links each loyalty row's corporation name to the LP Store, with a trailing caret and no store column", async () => {
    render(<App />);
    expect(await screen.findByText(/4,500\.00/)).toBeInTheDocument();
    // A real link, not just a row click: a keyboard or screen-reader user
    // reaches the LP Store without the row. Not a Show Info link any more.
    expect(screen.getByRole('link', { name: 'Caldari Navy' })).toHaveAttribute(
      'href',
      '/market/lp-store/1000167'
    );
    expect(screen.queryByRole('columnheader', { name: 'LP Store' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Open LP Store/ })).not.toBeInTheDocument();
  });

  it('offers the LP Store picker even when the Character holds no LP anywhere (issue #2321)', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/loyalty/points`, () =>
        HttpResponse.json([])
      )
    );
    render(<App />);
    expect(await screen.findByText(/4,500\.00/)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /LP Store corporation/ })).toBeInTheDocument();
  });

  it('has no row menu or More actions button on a loyalty row: the name and row open the store', async () => {
    render(<App />);
    expect(await screen.findByText(/4,500\.00/)).toBeInTheDocument();
    const row = screen.getByText('Caldari Navy').closest('tr') as HTMLElement;
    expect(within(row).queryByRole('button', { name: /More actions/ })).not.toBeInTheDocument();
    fireEvent.contextMenu(row);
    expect(screen.queryByRole('menuitem', { name: 'Show info' })).not.toBeInTheDocument();
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
    expect(screen.getByText(/^no loyalty points$/i)).toBeInTheDocument();
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
    const breakdown = await screen.findByRole('table', { name: 'Where the ISK went' });
    const rows = (await screen.findAllByRole('row')).filter((row) => !breakdown.contains(row));
    // header + 2 entries, newest (2026-08-02) first
    expect(rows).toHaveLength(3);
    expect(screen.getByText('Bounty')).toBeInTheDocument();
    expect(screen.getByText('Donation')).toBeInTheDocument();
  });

  it('names the item a market transaction line bought, linked to its Show info', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/wallet/journal`, () =>
        HttpResponse.json([
          {
            id: 3,
            date: '2026-08-03T00:00:00Z',
            ref_type: 'market_transaction',
            description: 'Market: Pilot One bought stuff',
            amount: -500,
            balance: 3500,
          },
          ...journalPage1,
        ])
      ),
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/wallet/transactions`, () =>
        HttpResponse.json([
          {
            transaction_id: 70,
            date: '2026-08-03T00:00:00Z',
            location_id: 60003760,
            type_id: 34,
            unit_price: 5,
            quantity: 100,
            client_id: 9000,
            is_buy: true,
            journal_ref_id: 3,
            is_personal: true,
          },
        ])
      )
    );
    window.history.pushState({}, '', '/wallet/journal');
    render(<App />);
    const link = await screen.findByRole('link', { name: /Tritanium/ });
    expect(link.getAttribute('href')).toContain('info=type-34');
    // The bounty line has no fill behind it, so it names no item.
    const bountyRow = document.querySelector('[data-row-key="1"]') as HTMLElement;
    expect(within(bountyRow).queryByRole('link')).not.toBeInTheDocument();
  });

  it('opens straight to the journal tab when a walletBalanceChanged notification deep-links here', async () => {
    window.history.pushState({}, '', '/wallet/journal');
    render(<App />);
    expect(await screen.findByText('Bounty')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Journal' })).toHaveAttribute('aria-selected', 'true');
  });

  it('redirects /wallet/transactions to Market › History (issue #1749)', async () => {
    window.history.pushState({}, '', '/wallet/transactions');
    render(<App />);
    await waitFor(() => expect(window.location.pathname).toBe('/market/history/transactions'));
  });

  it('links the personal Journal header to Market › History › Transactions (issue #1749)', async () => {
    window.history.pushState({}, '', '/wallet/journal');
    render(<App />);
    const link = await screen.findByRole('link', { name: 'Transactions →' });
    expect(link).toHaveAttribute('href', '/market/history/transactions');
    // Rests in the accent colour so it reads as a link (issue #2019).
    expect(link).toHaveClass('text-accent');
  });

  describe('opened for a chosen Character (issue #2936)', () => {
    async function seedSecond() {
      await db.characters.put({ characterId: 92, name: 'Bex Roan', ownerHash: 'oh2', addedAt: 2 });
      await db.tokens.put({
        characterId: 92,
        accessToken: 'access-2',
        refreshToken: 'refresh-2',
        expiresAt: Date.now() + 3_600_000,
        scopes: ['esi-wallet.read_character_wallet.v1', 'esi-characters.read_loyalty.v1'],
      });
      server.use(
        http.get('https://esi.evetech.net/characters/92/wallet', () => HttpResponse.json(777)),
        http.get('https://esi.evetech.net/characters/92/wallet/journal', () =>
          HttpResponse.json(journalPage1, { headers: { 'X-Pages': '1' } })
        ),
        http.get('https://esi.evetech.net/characters/92/loyalty/points', () =>
          HttpResponse.json([])
        ),
        http.get('https://esi.evetech.net/characters/92/wallet/transactions', () =>
          HttpResponse.json([])
        )
      );
    }

    it.each(['char', 'chars'])(
      'shows that Character via ?%s= without switching the active one',
      async (key) => {
        await seedSecond();
        window.history.pushState({}, '', `/wallet/journal?${key}=92`);
        render(<App />);
        expect(await screen.findByText('Bex Roan only')).toBeInTheDocument();
        expect(useActiveCharacter.getState().activeCharacterId).toBe(CHAR_ID);
      }
    );

    it('shows the ‹ Wallet crumb only when arriving from the Wallet chart', async () => {
      await seedSecond();
      window.history.pushState({}, '', '/wallet/journal?char=92');
      const plain = render(<App />);
      expect(await screen.findByText('Bex Roan only')).toBeInTheDocument();
      expect(
        within(screen.getByRole('main')).queryByRole('link', { name: 'Wallet' })
      ).not.toBeInTheDocument();
      plain.unmount();

      window.history.pushState(
        { usr: { origin: 'wallet' }, key: 'k1', idx: 1 },
        '',
        '/wallet/journal?char=92'
      );
      render(<App />);
      expect(await screen.findByText('Bex Roan only')).toBeInTheDocument();
      expect(
        within(screen.getByRole('main')).getByRole('link', { name: /Wallet/ })
      ).toHaveAttribute('href', '/wallet');
    });

    it('shows the grant note for a Character without the wallet scope', async () => {
      await seedSecond();
      await db.tokens.update(92, { scopes: [] });
      window.history.pushState({}, '', '/wallet/journal?char=92');
      render(<App />);
      expect(await screen.findByText('Bex Roan only')).toBeInTheDocument();
      expect(await screen.findByRole('button', { name: /^Log in again/ })).toBeInTheDocument();
    });
  });

  it('says the Journal reads one Character (issue #2846)', async () => {
    window.history.pushState({}, '', '/wallet/journal');
    render(<App />);
    expect(await screen.findByText('Pilot One only')).toBeInTheDocument();
  });

  it('scrolls to and pulses the journal line a wallet alert pointed at', async () => {
    const scrollIntoView = vi
      .spyOn(Element.prototype, 'scrollIntoView')
      .mockImplementation(() => {});
    window.history.pushState({}, '', '/wallet/journal?highlight=2');
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

    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    await user.click(screen.getByRole('combobox', { name: 'Ref type' }));
    await user.click(await screen.findByRole('option', { name: 'Bounty prize' }));

    expect(screen.getByText('Bounty')).toBeInTheDocument();
    expect(screen.queryByText('Donation')).toBeNull();
  });

  it('breaks the journal down by ref type and filters on a row click (issue #2858)', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Journal' }));
    await screen.findByText('Bounty');

    const breakdown = screen.getByRole('table', { name: 'Where the ISK went' });
    const bountyRow = within(breakdown).getByText('Bounty prize').closest('tr') as HTMLElement;
    await user.click(bountyRow);
    expect(screen.queryByText('Donation')).toBeNull();
    // The breakdown ignores the ref-type filter, so every type is still listed.
    expect(within(breakdown).getAllByRole('row').length).toBeGreaterThan(2);

    await user.click(bountyRow);
    expect(await screen.findByText('Donation')).toBeInTheDocument();
  });

  it('tones the filtered net total by sign (issue #1961)', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Journal' }));
    await screen.findByText('Bounty');

    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    await user.click(screen.getByRole('combobox', { name: 'Ref type' }));
    await user.click(await screen.findByRole('option', { name: 'Bounty prize' }));

    const net = (await screen.findAllByText('+1,000.00')).find((el) =>
      el.parentElement?.textContent?.includes('1 entry')
    ) as HTMLElement;
    expect(net).toHaveClass('text-isk-pos');
    expect(net.parentElement).toHaveTextContent('1 entry · net +1,000.00');
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

  it('shows no filtered-count summary when no filter is active (issue #1721)', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Journal' }));
    await screen.findByText('Bounty');

    expect(screen.queryByText(/entries · net/)).toBeNull();
    expect(screen.queryByText(/entry · net/)).toBeNull();
  });

  it('shows a filtered-count and net-total summary once a filter narrows the journal (issue #1721)', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Journal' }));
    await screen.findByText('Bounty');

    await user.type(screen.getByPlaceholderText('Search description…'), 'Donation');

    const summary = await screen.findByText(/1 entry/);
    expect(summary).toHaveTextContent('1 entry · net -500.00');
    expect(within(summary).getByText('-500.00')).toHaveClass('text-isk-neg');
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
    expect(screen.queryByText(/try again shortly/i)).not.toBeInTheDocument();
  });

  it('offers Reset filters on the filtered-empty journal, and restores every entry', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Journal' }));
    await screen.findByText('Bounty');

    await user.type(screen.getByPlaceholderText('Search description…'), 'nothing matches this');
    await screen.findByText('No journal entries match this filter.');

    await user.click(screen.getByRole('button', { name: 'Reset filters' }));
    expect(await screen.findByText('Bounty')).toBeInTheDocument();
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

  it('shows the re-login banner, not the empty state, when the journal scope was revoked', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/wallet/journal`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      )
    );
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Journal' }));
    expect(await screen.findByText('Log in again to see your wallet')).toBeInTheDocument();
    expect(screen.queryByText('No journal entries cached')).not.toBeInTheDocument();
  });

  it('shows no re-login banner when the journal loads normally', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Journal' }));
    expect(await screen.findByText('Bounty')).toBeInTheDocument();
    expect(screen.queryByText('Log in again to see your wallet')).not.toBeInTheDocument();
  });

  it('shows the offline notice and cached rows, no banner, when the journal fails offline', async () => {
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: 'wallet:journal',
      value: journalPage1,
      fetchedAt: STALE_FETCHED_AT,
    });
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/wallet/journal`, () =>
        HttpResponse.error()
      )
    );
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Journal' }));
    expect(await screen.findByText(/showing cached data/i)).toBeInTheDocument();
    expect(screen.queryByText('Log in again to see your wallet')).not.toBeInTheDocument();
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
      await user.click(await screen.findByRole('menuitemradio', { name: /^All characters/ }));

      // The panel below swaps to the per-character table; the picker rides
      // along into that panel's header rather than being left behind.
      const wideHeader = (
        await screen.findByRole('heading', { name: 'Balance by character' })
      ).closest('header');
      expect(
        within(wideHeader!).getByRole('button', { name: /^All characters/ })
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
      await user.click(await screen.findByRole('menuitemradio', { name: /^All characters/ }));

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

      expect(await screen.findByRole('button', { name: /^All characters/ })).toBeInTheDocument();
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
      await user.click(await screen.findByRole('menuitemradio', { name: /^All characters/ }));

      // All three selected: Pilot Three's skipped notice shows.
      expect(
        await screen.findByText(/Pilot Three.*hasn't granted wallet access/)
      ).toBeInTheDocument();

      // Narrow the filter back to "This character" — the notice list must
      // follow the same filter the balance rows do (issue #607 CodeRabbit
      // review), not just keep listing every skipped character regardless.
      await user.click(screen.getByRole('button', { name: /^All characters/ }));
      await user.click(screen.getByRole('menuitemradio', { name: 'This character' }));

      expect(
        screen.queryByText(/Pilot Three.*hasn't granted wallet access/)
      ).not.toBeInTheDocument();
      expect(await screen.findByText(/4,500\.00/)).toBeInTheDocument();
      expect(screen.queryByRole('table', { name: 'Balance by character' })).not.toBeInTheDocument();
    });
  });
});
