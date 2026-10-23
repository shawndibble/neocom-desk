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
import { useCharacterFilterPicks } from '@/features/character/characterFilterPicks';
import { App } from '@/app/App';
import * as routeChunks from '@/app/routeChunks';
import type { TypeMap } from '@/sde/types';
import { REQUIRED_SCOPES } from '@/features/netWorth/recordSnapshots';
import { loadAllCharactersJournals } from '@/features/character/walletJournalAll';

vi.mock('@/app/loginFlow', () => ({ beginEveLogin: vi.fn().mockResolvedValue(undefined) }));

// Wraps the real read so a test can see what it was asked for, or make it throw.
vi.mock('@/features/character/walletJournalAll', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/character/walletJournalAll')>();
  return { ...actual, loadAllCharactersJournals: vi.fn(actual.loadAllCharactersJournals) };
});

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
  await screen.findByText('EverMarks', {}, { timeout: 25_000 });
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
  await db.walletJournalArchive.clear();
  await db.walletTransactionArchive.clear();
  await db.walletArchiveCoverage.clear();
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
  usePublicInfo.setState({ byCharacterId: {} });
  useDefaultCharacterFilter.setState({ value: 'current', hydrated: false });
  useCharacterFilterPicks.setState({ value: {}, hydrated: false });

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
    expect(await screen.findByText('EverMarks')).toBeInTheDocument();
  });

  it('shows EverMarks (Paragon LP) alongside ISK, and other loyalty points in a table below', async () => {
    render(<App />);
    expect(await screen.findByText('EverMarks')).toBeInTheDocument();
    expect(screen.getByText('250')).toBeInTheDocument();
    expect(screen.getByText('Caldari Navy')).toBeInTheDocument();
    expect(screen.getByText('5,000')).toBeInTheDocument();
    // The Paragon corp itself doesn't also show up as a loyalty-table row.
    expect(screen.queryByText('#1000419')).not.toBeInTheDocument();
  });

  it('opens the LP Store from a loyalty row, with the corporation name as plain text and an ⓘ for Show Info (issue #4694)', async () => {
    render(<App />);
    expect(await screen.findByText('EverMarks')).toBeInTheDocument();
    // The row's click is the store (DESIGN §6c): the name inside it is no link.
    expect(screen.queryByRole('link', { name: 'Caldari Navy' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'LP Store' })).not.toBeInTheDocument();

    // The ⓘ opens Show Info over the Wallet, without the row's navigation.
    fireEvent.click(screen.getByRole('button', { name: 'Show info for Caldari Navy' }));
    await waitFor(() =>
      expect(new URLSearchParams(window.location.search).get('info')).toBe('corporation-1000167')
    );
    expect(window.location.pathname).not.toMatch(/lp-store/);

    fireEvent.click(screen.getByText('Caldari Navy').closest('tr') as HTMLElement);
    await waitFor(() => expect(window.location.pathname).toBe('/wallet/lp-store/1000167'));
  });

  describe('loyalty points across the picked Characters (issue #4694)', () => {
    async function seedSecond(loyalty: () => Response) {
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
        http.get('https://esi.evetech.net/characters/92/loyalty/points', loyalty)
      );
    }

    it("sums each corporation's points, and EverMarks, over every picked Character", async () => {
      await seedSecond(() =>
        HttpResponse.json([
          { corporation_id: 1000167, loyalty_points: 1500 },
          { corporation_id: 1000419, loyalty_points: 50 },
        ])
      );
      window.history.pushState({}, '', '/wallet?char=all');
      render(<App />);
      const table = await screen.findByRole('table', { name: 'Loyalty Points' });
      expect(await within(table).findByText('6,500')).toBeInTheDocument();
      expect(within(table).getAllByRole('row')).toHaveLength(2);
      const everMarks = screen.getByText('EverMarks').closest('div') as HTMLElement;
      expect(within(everMarks).getByText('300')).toBeInTheDocument();
    });

    it('names a picked Character whose grant lacks the loyalty scope, and sums the rest', async () => {
      await seedSecond(() => new HttpResponse(null, { status: 403 }));
      window.history.pushState({}, '', '/wallet?char=all');
      render(<App />);
      const table = await screen.findByRole('table', { name: 'Loyalty Points' });
      expect(await within(table).findByText('5,000')).toBeInTheDocument();
      expect(
        screen.getByText(/Bex Roan.*Log in again to see your loyalty points/)
      ).toBeInTheDocument();
    });
  });

  it('offers the LP Store picker even when the Character holds no LP anywhere (issue #2321)', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/loyalty/points`, () =>
        HttpResponse.json([])
      )
    );
    render(<App />);
    expect(await screen.findByText('EverMarks')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /LP Store corporation/ })).toBeInTheDocument();
  });

  it('has no row menu or More actions button on a loyalty row: the name and row open the store', async () => {
    render(<App />);
    expect(await screen.findByText('EverMarks')).toBeInTheDocument();
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

  it('collapses to one muted line (no panel) when there is no non-EverMarks LP', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/loyalty/points`, () =>
        HttpResponse.json([{ corporation_id: 1000419, loyalty_points: 250 }])
      )
    );
    render(<App />);
    expect(await screen.findByText('250')).toBeInTheDocument();
    expect(screen.getByText(/^loyalty points: none/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Loyalty Points' })).not.toBeInTheDocument();
    expect(screen.getByText('Select an LP Store')).toBeInTheDocument();
  });

  it('shows a re-login prompt under Loyalty Points (not the wallet reauth) when the loyalty scope was revoked', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/loyalty/points`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      )
    );
    render(<App />);
    expect(await screen.findByText('EverMarks')).toBeInTheDocument();
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

  it('shows Balance, Journal and LP Store tabs (issue #3527)', async () => {
    render(<App />);
    const tabs = within(await screen.findByRole('tablist', { name: 'Wallet' })).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Balance', 'Journal', 'LP Store']);
  });

  it("opens the LP Store from Wallet's tab, leaving Wallet's query behind (issue #3527)", async () => {
    window.history.pushState({}, '', '/wallet/journal?journal.q=bounty');
    render(<App />);
    fireEvent.click(await screen.findByRole('tab', { name: 'LP Store' }));
    await waitFor(() => expect(window.location.pathname).toBe('/wallet/lp-store'));
    expect(window.location.search).toBe('');
    expect(
      await screen.findByRole('tab', { name: 'LP Store', selected: true })
    ).toBeInTheDocument();
  });

  it('opens a store from its URL as the LP Store tab, under the Wallet tab bar (issue #3527)', async () => {
    window.history.pushState({}, '', '/wallet/lp-store/1000167');
    render(<App />);
    expect(
      await screen.findByRole('tab', { name: 'LP Store', selected: true })
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Balance' })).toBeInTheDocument();
  });

  it('moves an old Market LP Store link to Wallet, keeping the corporation and query (issue #3527)', async () => {
    window.history.pushState({}, '', '/market/lp-store/1000167?affordableOnly=0#x');
    render(<App />);
    await waitFor(() => expect(window.location.pathname).toBe('/wallet/lp-store/1000167'));
    expect(window.location.search).toBe('?affordableOnly=0');
    expect(window.location.hash).toBe('#x');
    expect(
      await screen.findByRole('tab', { name: 'LP Store', selected: true })
    ).toBeInTheDocument();
  });

  it('moves the old Market LP Store landing to Wallet with its search (issue #3527)', async () => {
    window.history.pushState({}, '', '/market/lp-store?q=tritanium');
    render(<App />);
    await waitFor(() => expect(window.location.pathname).toBe('/wallet/lp-store'));
    expect(window.location.search).toBe('?q=tritanium');
  });

  it('redirects /wallet/transactions to Market › History (issue #1749)', async () => {
    window.history.pushState({}, '', '/wallet/transactions');
    render(<App />);
    await waitFor(() => expect(window.location.pathname).toBe('/market/history'));
  });

  it('links the personal Journal header to Market › History (issue #1749)', async () => {
    window.history.pushState({}, '', '/wallet/journal');
    render(<App />);
    const link = await screen.findByRole('link', { name: 'Transactions' });
    expect(link).toHaveAttribute('href', '/market/history');
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
        expect(await screen.findByRole('link', { name: /Transactions/ })).toBeInTheDocument();
        expect(useActiveCharacter.getState().activeCharacterId).toBe(CHAR_ID);
      }
    );

    it('shows the ‹ Wallet crumb only when arriving from the Wallet chart', async () => {
      await seedSecond();
      window.history.pushState({}, '', '/wallet/journal?char=92');
      const plain = render(<App />);
      expect(await screen.findByRole('link', { name: /Transactions/ })).toBeInTheDocument();
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
      expect(await screen.findByRole('link', { name: /Transactions/ })).toBeInTheDocument();
      expect(
        within(screen.getByRole('main')).getByRole('link', { name: /Wallet/ })
      ).toHaveAttribute('href', '/wallet');
    });

    it('shows the grant note for a Character without the wallet scope', async () => {
      await seedSecond();
      await db.tokens.update(92, { scopes: [] });
      window.history.pushState({}, '', '/wallet/journal?char=92');
      render(<App />);
      expect(await screen.findByRole('link', { name: /Transactions/ })).toBeInTheDocument();
      expect(
        (await screen.findAllByRole('button', { name: /grant|log in again/i })).length
      ).toBeGreaterThan(0);
    });
  });

  it('keeps the Journal panel header free of a Character portrait and scope label (issue #2993)', async () => {
    window.history.pushState({}, '', '/wallet/journal');
    render(<App />);
    expect(await screen.findByRole('link', { name: /Transactions/ })).toBeInTheDocument();
    expect(screen.queryByText(/ only$/)).not.toBeInTheDocument();
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
    expect(await screen.findByText(/showing cached data/i)).toBeInTheDocument();
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

    await user.click(screen.getByRole('button', { name: 'Where the ISK went' }));
    const breakdown = await screen.findByRole('table', { name: 'Where the ISK went' });
    const bountyRow = within(breakdown).getByText('Bounty prize').closest('tr') as HTMLElement;
    await user.click(bountyRow);
    expect(screen.queryByText('Donation')).toBeNull();
    expect(screen.getByRole('button', { name: 'Type: Bounty prize' })).toBeInTheDocument();
    // The breakdown ignores the ref-type filter, so every type is still listed.
    expect(within(breakdown).getAllByRole('row').length).toBeGreaterThan(2);

    await user.click(bountyRow);
    expect(await screen.findByText('Donation')).toBeInTheDocument();
  });

  it('shows one full-precision signed Net column in the breakdown (issues #2995, #3220)', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Journal' }));
    await screen.findByText('Bounty');

    await user.click(screen.getByRole('button', { name: 'Where the ISK went' }));
    const breakdown = await screen.findByRole('table', { name: 'Where the ISK went' });
    const headers = within(breakdown)
      .getAllByRole('columnheader')
      .map((header) => header.textContent);
    expect(headers).toEqual(['Ref type', 'Net']);
    const bountyRow = within(breakdown).getByText('Bounty prize').closest('tr') as HTMLElement;
    expect(bountyRow).toHaveTextContent('+1,000');
    // Single-sided ref types carry no second in/out line.
    expect(breakdown).not.toHaveTextContent(/in S+ · out/);
    // The In / Out / Net summary is a ledger: full figures, not shorthand.
    expect(screen.getAllByText('+500').length).toBeGreaterThan(0);
  });

  it('tones the filtered net total by sign (issue #1961)', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Journal' }));
    await screen.findByText('Bounty');

    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    await user.click(screen.getByRole('combobox', { name: 'Ref type' }));
    await user.click(await screen.findByRole('option', { name: 'Bounty prize' }));

    const line = (await screen.findByText('1 entry')).parentElement as HTMLElement;
    expect(within(line).getByText('+1,000')).toHaveClass('text-isk-pos');
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

    expect(screen.queryByText(/Type: /)).toBeNull();
  });

  it('shows a filtered-count and net-total summary once a filter narrows the journal (issue #1721)', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Journal' }));
    await screen.findByText('Bounty');

    await user.type(screen.getByPlaceholderText('Search description…'), 'Donation');

    const summary = (await screen.findByText('1 entry')).parentElement as HTMLElement;
    expect(within(summary).getByText('-500')).toHaveClass('text-isk-neg');
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

  it('still shows the Worth panel, with a dash for net worth, when the wallet read fails and nothing is cached', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/wallet`, () => HttpResponse.error())
    );
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Worth' })).toBeInTheDocument();
    expect(screen.getByText('Net worth', { selector: 'p' }).nextElementSibling).toHaveTextContent(
      '—'
    );
  });

  it('puts net worth, EverMarks and the series picker in one Worth panel, with no scope readout', async () => {
    render(<App />);
    const header = (await screen.findByRole('heading', { name: 'Worth' })).closest('header');
    expect(await screen.findByText('EverMarks')).toBeInTheDocument();
    expect(within(header!).getByRole('button', { name: /^Layers:/ })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Balance' })).toBeNull();
    expect(screen.queryByText(/ only$/)).toBeNull();
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
    expect(await screen.findByText('EverMarks')).toBeInTheDocument();
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

    /** Wallet, assets and orders: what a net worth snapshot needs. */
    async function grantSnapshotScopes(...ids: number[]) {
      for (const id of ids) {
        await db.tokens.update(id, {
          scopes: [...REQUIRED_SCOPES, 'esi-characters.read_loyalty.v1'],
        });
      }
    }

    it('renders no character filter for an account with one Character — nothing for it to change', async () => {
      // Deliberately no `seedSecondCharacter()`: the outer beforeEach leaves
      // exactly one pilot in Dexie.
      render(<App />);

      expect(await screen.findByText('EverMarks')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'This character' })).toBeNull();
    });

    it('puts the character filter in the page header, and keeps it there across the panel swap', async () => {
      const user = userEvent.setup();
      await seedSecondCharacter();
      render(<App />);

      // In the PageHeader's scope slot, not the Worth panel's title bar.
      await screen.findByText('EverMarks');
      const pageHeader = () => screen.getByRole('heading', { level: 1 }).closest('header')!;
      const panelHeader = screen.getByRole('heading', { name: 'Worth' }).closest('header')!;
      expect(within(panelHeader).queryByRole('button', { name: 'This character' })).toBeNull();
      await user.click(within(pageHeader()).getByRole('button', { name: 'This character' }));
      await user.click(await screen.findByRole('menuitemradio', { name: /^All characters/ }));

      // The panel below swaps to the per-character table; the picker stays put.
      await screen.findByRole('table', { name: 'Balance by character' });
      expect(
        within(pageHeader()).getByRole('button', { name: /^All characters/ })
      ).toBeInTheDocument();
    });

    it("shows only the active character's balance by default — no picker-driven fetch", async () => {
      await seedSecondCharacter();
      render(<App />);

      expect(await screen.findByText('EverMarks')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'This character' })).toBeInTheDocument();
      expect(screen.queryByText(/1,500\.00/)).not.toBeInTheDocument();
    });

    it('switching to "All characters" shows every character\'s balance and a total', async () => {
      const user = userEvent.setup();
      await seedSecondCharacter();
      await grantSnapshotScopes(CHAR_ID, 92);
      render(<App />);

      await screen.findByText('EverMarks');
      await user.click(screen.getByRole('button', { name: 'This character' }));
      await user.click(await screen.findByRole('menuitemradio', { name: /^All characters/ }));

      const table = await screen.findByRole('table', { name: 'Balance by character' });
      expect(await within(table).findByText('Pilot One')).toBeInTheDocument();
      expect(within(table).getByText('Pilot Two')).toBeInTheDocument();
      // 4,500 + 1,500 = 6,000 — the Net worth figure, distinct from either row's own.
      expect(await screen.findByText('6,000')).toBeInTheDocument();
    });

    it('drills into a Character from its row as route state, and Back returns to all', async () => {
      const user = userEvent.setup();
      await seedSecondCharacter();
      await grantSnapshotScopes(CHAR_ID, 92);
      await db.settings.put({ key: 'sync.defaultCharacterFilter', value: 'all' });
      render(<App />);

      const table = await screen.findByRole('table', { name: 'Balance by character' });
      await user.click(await within(table).findByText('Pilot Two'));

      await waitFor(() => expect(window.location.search).toContain('drill=92'));
      expect(screen.queryByRole('table', { name: 'Balance by character' })).toBeNull();

      // The browser Back button undoes the drill.
      window.history.back();
      expect(
        await screen.findByRole('table', { name: 'Balance by character' })
      ).toBeInTheDocument();
      await waitFor(() => expect(window.location.search).not.toContain('drill='));
    });

    it('ends a drill when the header picker changes', async () => {
      const user = userEvent.setup();
      await seedSecondCharacter();
      await grantSnapshotScopes(CHAR_ID, 92);
      await db.settings.put({ key: 'sync.defaultCharacterFilter', value: 'all' });
      render(<App />);

      const table = await screen.findByRole('table', { name: 'Balance by character' });
      await user.click(await within(table).findByText('Pilot Two'));
      await waitFor(() => expect(window.location.search).toContain('drill=92'));

      const pageHeader = screen.getByRole('heading', { level: 1 }).closest('header')!;
      await user.click(within(pageHeader).getByRole('button', { name: /^All characters/ }));
      await user.click(await screen.findByRole('menuitemradio', { name: 'This character' }));

      await waitFor(() => expect(window.location.search).not.toContain('drill='));
      expect(window.location.search).not.toContain('char=all');
      expect(
        within(pageHeader).getByRole('button', { name: 'This character' })
      ).toBeInTheDocument();
      expect(screen.queryByText('Pilot Two only')).not.toBeInTheDocument();
    });

    it('offers no Character picker on the LP Store tab', async () => {
      await seedSecondCharacter();
      await db.settings.put({ key: 'sync.defaultCharacterFilter', value: 'all' });
      window.history.pushState({}, '', '/wallet/lp-store');
      render(<App />);

      const title = await screen.findByRole('heading', { level: 1, name: 'LP Store' });
      expect(
        within(title.closest('header')!).queryByRole('button', { name: /characters?/i })
      ).toBeNull();
    });

    it('moves focus to the drilled back button, then the Character row, never the body', async () => {
      const user = userEvent.setup();
      await seedSecondCharacter();
      await grantSnapshotScopes(CHAR_ID, 92);
      await db.settings.put({ key: 'sync.defaultCharacterFilter', value: 'all' });
      render(<App />);

      const table = await screen.findByRole('table', { name: 'Balance by character' });
      await user.click(await within(table).findByText('Pilot Two'));
      await waitFor(() => {
        expect(document.activeElement?.tagName).toBe('BUTTON');
        expect(document.activeElement).toHaveTextContent('All characters');
      });

      await user.click(document.activeElement as HTMLElement);
      await waitFor(() =>
        expect(document.activeElement?.closest('[data-row-key]')).toHaveAttribute(
          'data-row-key',
          '92'
        )
      );
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

    it('spins in the picker while the page loads, as Mail and Contracts do', async () => {
      await seedSecondCharacter();
      // Released at the end: a request that never settles stays in the ESI
      // cache's module-level `inFlightLoads`, and every later test's wallet
      // read joins it and hangs.
      let release: () => void = () => {};
      const gate = new Promise<void>((resolve) => (release = resolve));
      server.use(
        http.get(`https://esi.evetech.net/characters/${CHAR_ID}/wallet`, async () => {
          await gate;
          return HttpResponse.json(1000);
        })
      );
      render(<App />);

      const picker = await screen.findByRole('button', { name: 'This character' });
      expect(picker).toHaveAttribute('aria-busy', 'true');
      release();
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'This character' })).not.toHaveAttribute(
          'aria-busy'
        )
      );
    });

    it('only shows a "hasn\'t granted access" notice for a skipped character actually in the selected filter', async () => {
      const user = userEvent.setup();
      await seedSecondCharacter();
      await grantSnapshotScopes(CHAR_ID, 92);
      const CHAR_C = 93;
      await db.characters.put({
        characterId: CHAR_C,
        name: 'Pilot Three',
        ownerHash: 'oh3',
        addedAt: 3,
      });
      // CHAR_C deliberately gets no token at all — never granted the scope.
      render(<App />);

      await screen.findByText('EverMarks');
      await user.click(screen.getByRole('button', { name: 'This character' }));
      await user.click(await screen.findByRole('menuitemradio', { name: /^All characters/ }));

      // All three selected: Pilot Three is left out, named by the picker's
      // accessible name (and its menu note) and flagged on its own row.
      expect(
        await screen.findByRole('button', { name: /^All characters.*Not included: Pilot Three$/ })
      ).toBeInTheDocument();
      expect(
        await screen.findByRole('link', { name: 'Grant missing Permissions' })
      ).toBeInTheDocument();

      // Narrow the filter back to "This character" — the notice list must
      // follow the same filter the balance rows do (issue #607 CodeRabbit
      // review), not just keep listing every skipped character regardless.
      await user.click(screen.getByRole('button', { name: /^All characters/ }));
      await user.click(screen.getByRole('menuitemradio', { name: 'This character' }));

      expect(
        screen.queryByRole('link', { name: 'Grant missing Permissions' })
      ).not.toBeInTheDocument();
      expect(await screen.findByRole('heading', { name: 'Worth' })).toBeInTheDocument();
      expect(screen.queryByRole('table', { name: 'Balance by character' })).not.toBeInTheDocument();
    });
  });

  describe('journal across Characters (issue #3908)', () => {
    async function seedSecondWithJournal() {
      await db.characters.put({ characterId: 92, name: 'Pilot Two', ownerHash: 'oh2', addedAt: 2 });
      await db.tokens.put({
        characterId: 92,
        accessToken: 'access-token-b',
        refreshToken: 'refresh-b',
        expiresAt: Date.now() + 3_600_000,
        scopes: ['esi-wallet.read_character_wallet.v1'],
      });
      server.use(
        // The same entry id as Pilot One's line 1.
        http.get('https://esi.evetech.net/characters/92/wallet/journal', () =>
          HttpResponse.json(journalPage1, { headers: { 'X-Pages': '1' } })
        ),
        http.get('https://esi.evetech.net/characters/92/wallet/transactions', () =>
          HttpResponse.json([])
        )
      );
    }

    async function pickAllCharacters(user: ReturnType<typeof userEvent.setup>) {
      await user.click(await screen.findByRole('button', { name: 'This character' }));
      await user.click(await screen.findByRole('menuitemradio', { name: /^All characters/ }));
    }

    beforeEach(() => vi.mocked(loadAllCharactersJournals).mockClear());

    it('fans out over the picked Characters, keys rows per Character and keeps the filter in the header', async () => {
      await seedSecondWithJournal();
      window.history.pushState({}, '', '/wallet/journal');
      const user = userEvent.setup();
      render(<App />);
      await pickAllCharacters(user);

      const table = await screen.findByRole('table', { name: 'Journal' });
      await within(table).findAllByText('Pilot Two');
      expect(document.querySelector('[data-row-key="91:1"]')).toBeInTheDocument();
      expect(document.querySelector('[data-row-key="92:1"]')).toBeInTheDocument();
      expect(vi.mocked(loadAllCharactersJournals)).toHaveBeenCalledWith([
        { characterId: 91, name: 'Pilot One' },
        { characterId: 92, name: 'Pilot Two' },
      ]);
      // The picker in the page header; the panel's title bar keeps the age of the data.
      const pageHeader = screen.getByRole('heading', { level: 1 }).closest('header');
      expect(
        within(pageHeader!).getByRole('button', { name: /^All characters/ })
      ).toBeInTheDocument();
      const header = screen.getByRole('heading', { name: 'Journal' }).closest('header');
      expect(header!.textContent).toMatch(/ago|just now|now/i);
    });

    it('shows a load-failed state with Try again when the all-Characters read fails, and loads on retry', async () => {
      await seedSecondWithJournal();
      window.history.pushState({}, '', '/wallet/journal');
      vi.mocked(loadAllCharactersJournals).mockRejectedValueOnce(new Error('boom'));
      const user = userEvent.setup();
      render(<App />);
      await pickAllCharacters(user);

      await user.click(await screen.findByRole('button', { name: 'Try again' }));
      const table = await screen.findByRole('table', { name: 'Journal' });
      expect(await within(table).findAllByText('Pilot Two')).not.toHaveLength(0);
    });
  });
});
