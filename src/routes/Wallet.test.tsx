import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import '@/i18n';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { App } from '@/app/App';
import { installWalletHarness, CHAR_ID, journalPage1, server } from '@/test/walletPage';

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

vi.mock('@/sde/loadSde', () => ({
  loadSkills: vi.fn(async () => []),
  loadTypes: vi.fn(async () => ({
    '34': { name: 'Tritanium', groupID: 18, volume: 0.01 },
    '35': { name: 'Pyerite', groupID: 18, volume: 0.01 },
  })),
  loadBlueprints: vi.fn(async () => ({})),
  loadPi: vi.fn(async () => ({ schematics: {}, raw: [] })),
  loadMarketWideTrees: vi.fn(async () => ({})),
}));

installWalletHarness();

describe('Wallet', () => {
  it('shows the balance tab by default, from mocked ESI', async () => {
    render(<App />);
    expect(await screen.findByText('EverMarks')).toBeInTheDocument();
  });

  it('shows EverMarks (Paragon LP) alongside ISK, with no per-corporation loyalty table', async () => {
    render(<App />);
    expect(await screen.findByText('EverMarks')).toBeInTheDocument();
    expect(screen.getByText('250')).toBeInTheDocument();
    // The per-corporation list is the LP Store tab's, not Balance's.
    expect(screen.queryByRole('table', { name: 'Loyalty Points' })).not.toBeInTheDocument();
    expect(screen.queryByText('Caldari Navy')).not.toBeInTheDocument();
  });

  it('sums EverMarks over every picked Character', async () => {
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
      http.get('https://esi.evetech.net/characters/92/loyalty/points', () =>
        HttpResponse.json([{ corporation_id: 1000419, loyalty_points: 50 }])
      )
    );
    window.history.pushState({}, '', '/wallet?char=all');
    render(<App />);
    const everMarks = (await screen.findByText('EverMarks')).closest('div') as HTMLElement;
    expect(await within(everMarks).findByText('300')).toBeInTheDocument();
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
});
