import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { vi } from 'vitest';
import '@/i18n';
import { db } from '@/db';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { App } from '@/app/App';

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}));

vi.mock('@/sde/loadSde', () => ({
  loadSkills: vi.fn(async () => []),
  loadTypes: vi.fn(async () => ({})),
  loadBlueprints: vi.fn(async () => ({})),
}));

const CHAR_ID = 91;
const ESI = 'https://esi.evetech.net';

const loyaltyPayload = [
  { corporation_id: 1000167, loyalty_points: 5000 },
  { corporation_id: 1000169, loyalty_points: 120 },
];

const server = setupServer(
  http.get(`${ESI}/characters/${CHAR_ID}/loyalty/points`, () => HttpResponse.json(loyaltyPayload)),
  http.post(`${ESI}/universe/names`, () =>
    HttpResponse.json([
      { id: 1000167, name: 'Caldari Navy', category: 'corporation' },
      { id: 1000169, name: 'Federation Navy', category: 'corporation' },
    ])
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
    scopes: ['esi-characters.read_loyalty.v1'],
  });
  await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: CHAR_ID });
  window.history.pushState({}, '', '/loyalty');
});

describe('Loyalty', () => {
  it('lists loyalty point balances with resolved corporation names', async () => {
    render(<App />);
    expect(await screen.findByText('Caldari Navy')).toBeInTheDocument();
    expect(screen.getByText('Federation Navy')).toBeInTheDocument();
    expect(screen.getByText('5,000')).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
  });

  it('falls back to cached loyalty points offline', async () => {
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: 'loyalty',
      value: loyaltyPayload,
      fetchedAt: Date.now(),
    });
    server.use(http.get(`${ESI}/characters/${CHAR_ID}/loyalty/points`, () => HttpResponse.error()));
    render(<App />);
    expect(await screen.findByText('Caldari Navy')).toBeInTheDocument();
    expect(screen.getByText(/showing cached data/i)).toBeInTheDocument();
  });

  it('shows the empty state when there is no data at all', async () => {
    server.use(http.get(`${ESI}/characters/${CHAR_ID}/loyalty/points`, () => HttpResponse.error()));
    render(<App />);
    expect(await screen.findByText(/no loyalty points cached/i)).toBeInTheDocument();
  });

  it('shows the empty state (not a blank table) when the character has no loyalty points', async () => {
    server.use(
      http.get(`${ESI}/characters/${CHAR_ID}/loyalty/points`, () => HttpResponse.json([]))
    );
    render(<App />);
    expect(await screen.findByText(/no loyalty points cached/i)).toBeInTheDocument();
  });

  it('shows a re-login prompt (not a silent empty state) when the loyalty scope was revoked', async () => {
    server.use(
      http.get(`${ESI}/characters/${CHAR_ID}/loyalty/points`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      )
    );
    render(<App />);
    expect(await screen.findByText('Log in again to see your loyalty points')).toBeInTheDocument();
    expect(screen.queryByText(/no loyalty points cached/i)).not.toBeInTheDocument();
  });
});
