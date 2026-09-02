import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { db } from '@/db';
import { STALE_FETCHED_AT } from '@/esi/cacheFixtures';
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

const history = [
  { record_id: 2, corporation_id: 200, start_date: '2026-01-01T00:00:00Z' },
  { record_id: 1, corporation_id: 100, start_date: '2025-01-01T00:00:00Z' },
];

const server = setupServer(
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/corporationhistory`, () =>
    HttpResponse.json(history)
  ),
  http.post('https://esi.evetech.net/universe/names', () =>
    HttpResponse.json([
      { id: 200, name: 'Current Corp', category: 'corporation' },
      { id: 100, name: 'Past Corp', category: 'corporation' },
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
  // No token scopes granted at all: the route is public and must not require one.
  await db.tokens.put({
    characterId: CHAR_ID,
    accessToken: 'access-token',
    refreshToken: 'refresh',
    expiresAt: Date.now() + 3_600_000,
    scopes: [],
  });
  await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: CHAR_ID });
  window.history.pushState({}, '', '/employment-history');
});

describe('EmploymentHistory', () => {
  it('lists corporations most-recent first, with resolved names, without any granted scope', async () => {
    render(<App />);
    expect(await screen.findByText('Current Corp')).toBeInTheDocument();
    expect(screen.getByText('Past Corp')).toBeInTheDocument();
    const rows = screen.getAllByRole('row');
    // Row 0 is the header; row 1 should be the most recent corp.
    expect(rows[1]).toHaveTextContent('Current Corp');
    expect(rows[2]).toHaveTextContent('Past Corp');
    // Past Corp ran exactly 2025-01-01 to 2026-01-01: a full non-leap year.
    expect(rows[2]).toHaveTextContent('365d');
  });

  it('falls back to cached history offline', async () => {
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: 'employment-history',
      value: history,
      fetchedAt: STALE_FETCHED_AT,
    });
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/corporationhistory`, () =>
        HttpResponse.error()
      )
    );
    render(<App />);
    expect(await screen.findByText(/#200|Current Corp/)).toBeInTheDocument();
    expect(screen.getByText(/showing cached data/i)).toBeInTheDocument();
  });

  it('shows the empty state when there is no data at all', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/corporationhistory`, () =>
        HttpResponse.error()
      )
    );
    render(<App />);
    expect(await screen.findByText(/no employment history cached/i)).toBeInTheDocument();
  });
});
