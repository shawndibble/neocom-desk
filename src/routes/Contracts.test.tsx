import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
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

const contractPage1 = [
  {
    contract_id: 1,
    issuer_id: 500001,
    issuer_corporation_id: 2,
    assignee_id: 3,
    acceptor_id: 0,
    type: 'item_exchange' as const,
    status: 'outstanding' as const,
    for_corporation: false,
    availability: 'personal' as const,
    date_issued: '2026-08-01T00:00:00Z',
    date_expired: '2099-08-10T00:00:00Z',
    title: 'Rifter fit',
    price: 1_500_000,
  },
];
const contractPage2 = [
  {
    contract_id: 2,
    issuer_id: 500001,
    issuer_corporation_id: 2,
    assignee_id: 3,
    acceptor_id: 0,
    type: 'courier' as const,
    status: 'finished' as const,
    for_corporation: false,
    availability: 'personal' as const,
    date_issued: '2026-07-01T00:00:00Z',
    date_expired: '2026-07-10T00:00:00Z',
    reward: 500_000,
  },
];

const server = setupServer(
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/contracts`, ({ request }) => {
    const page = new URL(request.url).searchParams.get('page');
    return HttpResponse.json(page === '2' ? contractPage2 : contractPage1, {
      headers: { 'X-Pages': '2' },
    });
  }),
  http.post('https://esi.evetech.net/universe/names', () =>
    HttpResponse.json([{ id: 500001, name: 'Some Trader', category: 'character' }])
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
    scopes: ['esi-contracts.read_character_contracts.v1'],
  });
  await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: CHAR_ID });
  window.history.pushState({}, '', '/contracts');
});

describe('Contracts', () => {
  it('renders every page from mocked ESI with resolved issuer name and a status chip', async () => {
    render(<App />);
    expect(await screen.findByText('Rifter fit')).toBeInTheDocument();
    expect(screen.getByText('courier')).toBeInTheDocument();
    expect(screen.getAllByText(/Some Trader/).length).toBe(2);
    expect(screen.getByText('outstanding')).toBeInTheDocument();
    expect(screen.getByText('finished')).toBeInTheDocument();
  });

  it('dims the expired contract row', async () => {
    render(<App />);
    await screen.findByText('Rifter fit');
    const expiredRow = screen.getByText('courier').closest('tr');
    expect(expiredRow).toHaveClass('opacity-50');
    const activeRow = screen.getByText('Rifter fit').closest('tr');
    expect(activeRow).not.toHaveClass('opacity-50');
  });

  it('falls back to cached contracts offline', async () => {
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: 'contracts',
      value: [...contractPage1, ...contractPage2],
      fetchedAt: Date.now(),
    });
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/contracts`, () =>
        HttpResponse.error()
      )
    );
    render(<App />);
    expect(await screen.findByText('Rifter fit')).toBeInTheDocument();
    expect(screen.getByText(/showing cached data/i)).toBeInTheDocument();
  });

  it('shows the empty state when there is no data at all', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/contracts`, () =>
        HttpResponse.error()
      )
    );
    render(<App />);
    expect(await screen.findByText(/no contracts cached/i)).toBeInTheDocument();
  });

  it('shows a re-login prompt (not a silent empty state) when the contracts scope was revoked', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/contracts`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      )
    );
    render(<App />);
    expect(await screen.findByText('Log in again to see contracts')).toBeInTheDocument();
    expect(screen.queryByText(/no contracts cached/i)).not.toBeInTheDocument();
  });
});
