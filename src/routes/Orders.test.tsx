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

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}));

const TYPES: TypeMap = {
  '34': { name: 'Tritanium', groupID: 18, volume: 0.01 },
};

vi.mock('@/sde/loadSde', () => ({
  loadSkills: vi.fn(async () => []),
  loadTypes: vi.fn(async () => TYPES),
  loadBlueprints: vi.fn(async () => ({})),
}));

const CHAR_ID = 91;

const openOrder = {
  order_id: 1,
  type_id: 34,
  region_id: 10000002,
  location_id: 60003760,
  is_buy_order: false,
  is_corporation: false,
  price: 5.5,
  volume_remain: 100,
  volume_total: 200,
  issued: '2026-08-01T00:00:00Z',
  duration: 90,
  range: 'region',
};

const historyOrder = { ...openOrder, order_id: 2, state: 'expired' as const };

const server = setupServer(
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/orders`, () =>
    HttpResponse.json([openOrder])
  ),
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/orders/history`, () =>
    HttpResponse.json([historyOrder])
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
    scopes: ['esi-markets.read_character_orders.v1'],
  });
  await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: CHAR_ID });
  window.history.pushState({}, '', '/orders');
});

describe('Orders', () => {
  it('shows open orders by default with resolved item name', async () => {
    render(<App />);
    expect(await screen.findByText('Tritanium')).toBeInTheDocument();
    expect(screen.getByText('Sell')).toBeInTheDocument();
  });

  it('shows order history on the history tab', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Tritanium');
    await user.click(screen.getByRole('tab', { name: 'History' }));
    expect(await screen.findByText('expired')).toBeInTheDocument();
  });

  it('falls back to cached orders offline', async () => {
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: 'orders',
      value: [openOrder],
      fetchedAt: STALE_FETCHED_AT,
    });
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: 'orders:history',
      value: [historyOrder],
      fetchedAt: STALE_FETCHED_AT,
    });
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/orders`, () => HttpResponse.error()),
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/orders/history`, () =>
        HttpResponse.error()
      )
    );
    render(<App />);
    expect(await screen.findByText('Tritanium')).toBeInTheDocument();
    expect(screen.getByText(/showing cached data/i)).toBeInTheDocument();
  });

  it('shows the empty state when there is no data at all', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/orders`, () => HttpResponse.error()),
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/orders/history`, () =>
        HttpResponse.error()
      )
    );
    render(<App />);
    expect(await screen.findByText(/no open orders cached/i)).toBeInTheDocument();
  });

  it('shows a re-login prompt (not a silent empty state) when the orders scope was revoked', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/orders`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      ),
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/orders/history`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      )
    );
    render(<App />);
    expect(await screen.findByText('Log in again to see your orders')).toBeInTheDocument();
    expect(screen.queryByText(/no open orders cached/i)).not.toBeInTheDocument();
  });
});
