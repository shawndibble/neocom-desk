import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { db } from '@/db';
import { STALE_FETCHED_AT } from '@/esi/cacheFixtures';
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

import { loadTypes } from '@/sde/loadSde';

vi.mock('@/sde/loadSde', () => ({
  loadSkills: vi.fn(async () => []),
  loadTypes: vi.fn(async () => TYPES),
  loadBlueprints: vi.fn(async () => ({})),
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

const transactions = [
  {
    transaction_id: 1,
    date: '2026-08-01T00:00:00Z',
    location_id: 60003760,
    type_id: 34,
    unit_price: 5,
    quantity: 100,
    client_id: 1,
    is_buy: false,
    is_personal: true,
    journal_ref_id: 1,
  },
  {
    transaction_id: 2,
    date: '2026-08-01T00:00:01Z',
    location_id: 60003760,
    type_id: 35,
    unit_price: 12,
    quantity: 10,
    client_id: 2,
    is_buy: true,
    is_personal: true,
    journal_ref_id: 2,
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
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/wallet/transactions`, ({ request }) => {
    const fromId = new URL(request.url).searchParams.get('from_id');
    return HttpResponse.json(fromId === null ? transactions : []);
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

  it('humanizes the raw ESI ref_type into readable text', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Journal' }));
    expect(await screen.findByText('Bounty prize')).toBeInTheDocument();
    expect(screen.getByText('Player donation')).toBeInTheDocument();
    expect(screen.queryByText('bounty_prize')).not.toBeInTheDocument();
  });

  it('shows transactions with SDE item names resolved', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Transactions' }));
    expect(await screen.findByText('Tritanium')).toBeInTheDocument();
    expect(screen.getByText('Sell')).toBeInTheDocument();
  });

  it('signs and colors transaction totals: buy negative red, sell positive green', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Transactions' }));

    const sellTotal = await screen.findByText('500.00');
    expect(sellTotal.className).toContain('text-isk-pos');

    const buyTotal = await screen.findByText('-120.00');
    expect(buyTotal.className).toContain('text-isk-neg');
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

  it('warns that transactions stop at the page cap when every call comes back full (D4)', async () => {
    let calls = 0;
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/wallet/transactions`, () => {
        calls += 1;
        return HttpResponse.json([{ ...transactions[0], transaction_id: 1000 - calls }]);
      })
    );
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Transactions' }));
    expect(await screen.findByText(/recent transactions only/i)).toBeInTheDocument();
    expect(calls).toBe(5);
  });

  it('shows no truncation warning when the journal and transactions came back whole', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Journal' }));
    expect(await screen.findByText('Bounty')).toBeInTheDocument();
    expect(screen.queryByText(/incomplete data/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Transactions' }));
    expect(await screen.findByText('Tritanium')).toBeInTheDocument();
    expect(screen.queryByText(/recent transactions only/i)).not.toBeInTheDocument();
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

  it('says the load failed when a decoration throws, not that the wallet is empty', () => {
    // The real shape of this: balance, journal and transactions all resolve
    // from cache, and loadTypeNames' unconditional loadTypes() throws because
    // the SDE fetch failed. Before the hook stamped failures, the whole page
    // spun forever with Refresh disabled.
    vi.mocked(loadTypes).mockRejectedValueOnce(new Error('sde offline'));

    render(<App />);

    return screen.findByText(/Could not load/i).then((el) => expect(el).toBeInTheDocument());
  });
});
