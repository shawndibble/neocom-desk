import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { db } from '@/db';
import { STALE_FETCHED_AT } from '@/esi/cacheFixtures';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { usePublicInfoModalStore } from '@/stores/publicInfoModal';
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
  usePublicInfoModalStore.setState({ request: null });

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
  it('renders every page from mocked ESI with resolved issuer name and a humanized status', async () => {
    render(<App />);
    expect(await screen.findByText('Rifter fit')).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Contracts' });
    expect(within(table).getByText('Courier')).toBeInTheDocument();
    expect(screen.getAllByText(/Some Trader/).length).toBe(2);
    expect(within(table).getByText('Outstanding')).toBeInTheDocument();
    expect(within(table).getByText('Finished')).toBeInTheDocument();
  });

  it('dims only a lapsed, unclaimed contract — not a finished one whose deadline has simply passed', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/contracts`, ({ request }) => {
        const page = new URL(request.url).searchParams.get('page');
        if (page === '2') {
          return HttpResponse.json(contractPage2, { headers: { 'X-Pages': '2' } });
        }
        return HttpResponse.json(
          [
            ...contractPage1,
            {
              ...contractPage1[0],
              contract_id: 3,
              title: 'Lapsed offer',
              date_expired: '2020-01-01T00:00:00Z',
            },
          ],
          { headers: { 'X-Pages': '2' } }
        );
      })
    );
    render(<App />);
    await screen.findByText('Rifter fit');
    const table = screen.getByRole('table', { name: 'Contracts' });

    const freshRow = within(table).getByText('Rifter fit').closest('tr');
    expect(freshRow).not.toHaveClass('opacity-50');

    const staleRow = within(table).getByText('Lapsed offer').closest('tr');
    expect(staleRow).toHaveClass('opacity-50');

    // Finished, with a deadline in the past — no longer dims (issue: was
    // status-blind, so almost every completed contract dimmed).
    const finishedRow = within(table).getByText('Courier').closest('tr');
    expect(finishedRow).not.toHaveClass('opacity-50');
  });

  it('opens the contract detail modal on click', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/contracts/1/items`, () =>
        HttpResponse.json([])
      )
    );
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Rifter fit' }));
    expect(await screen.findByRole('dialog', { name: 'Rifter fit' })).toBeInTheDocument();
  });

  it('falls back to cached contracts offline', async () => {
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: 'contracts',
      value: [...contractPage1, ...contractPage2],
      fetchedAt: STALE_FETCHED_AT,
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
    expect(await screen.findByText('Log in again to see your contracts')).toBeInTheDocument();
    expect(screen.queryByText(/no contracts cached/i)).not.toBeInTheDocument();
  });
});

describe('Contracts market/issuer links and filters (issue #417)', () => {
  it('issuer name opens the shared Public Info Modal', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/500001`, () =>
        HttpResponse.json({
          name: 'Some Trader',
          birthday: '2020-01-01T00:00:00Z',
          bloodline_id: 1,
          gender: 'male',
          race_id: 1,
          security_status: 1.5,
        })
      )
    );
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Rifter fit');
    const table = screen.getByRole('table', { name: 'Contracts' });
    const [issuerButton] = within(table).getAllByRole('button', { name: 'Some Trader' });
    await user.click(issuerButton);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('tab', { name: 'Character' })).toBeInTheDocument();
  });

  it('a status filter chip narrows the table to matching rows', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Rifter fit');
    const table = screen.getByRole('table', { name: 'Contracts' });
    expect(within(table).getByText('Courier')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Outstanding' }));

    expect(within(table).getByText('Rifter fit')).toBeInTheDocument();
    expect(within(table).queryByText('Courier')).not.toBeInTheDocument();
  });

  it('search narrows contracts by title', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Rifter fit');
    const table = screen.getByRole('table', { name: 'Contracts' });

    await user.type(screen.getByPlaceholderText('Search issuer or title…'), 'rifter');

    expect(within(table).getByText('Rifter fit')).toBeInTheDocument();
    expect(within(table).queryByText('Courier')).not.toBeInTheDocument();
  });

  it('the truncation notice has a retry action', async () => {
    let page2Requests = 0;
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/contracts`, ({ request }) => {
        const page = new URL(request.url).searchParams.get('page');
        if (page === '2') {
          page2Requests += 1;
          return new HttpResponse(null, { status: 404 });
        }
        return HttpResponse.json(contractPage1, { headers: { 'X-Pages': '2' } });
      })
    );
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Rifter fit');
    expect(screen.getByText(/incomplete data/i)).toBeInTheDocument();
    const requestsBeforeRetry = page2Requests;

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(page2Requests).toBeGreaterThan(requestsBeforeRetry));
  });
});
