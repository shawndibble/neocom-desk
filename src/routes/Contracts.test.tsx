import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { act, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { db } from '@/db';
import { STALE_FETCHED_AT } from '@/esi/cacheFixtures';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { usePublicInfoModalStore } from '@/stores/publicInfoModal';
import { DEFAULT_TIME_FORMAT, TIME_FORMAT_SETTING_KEY, useTimeFormat } from '@/lib/timeFormat';
import { formatDateOnly, formatTimestamp } from '@/lib/timestamp';
import { App } from '@/app/App';
import * as routeChunks from '@/app/routeChunks';
import { Contracts } from '@/routes/Contracts';
import { renderPageRoute } from '@/test/renderPage';
import { NARROW_QUERY } from '@/lib/useIsNarrow';
import { stubViewport } from '@/test/viewport';

const openContractMock = vi.hoisted(() => vi.fn());
vi.mock('@/esi/endpoints', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/esi/endpoints')>()),
  postOpenWindowContract: openContractMock,
}));

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
  loadMarketWideTrees: vi.fn(async () => ({})),
}));

vi.mock('@/sync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/sync')>()),
  triggerSync: vi.fn(async () => {}),
  scheduleSync: vi.fn(),
}));

vi.mock('@/app/syncStatus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app/syncStatus')>();
  return { ...actual, isSyncConfigured: vi.fn(() => false) };
});

const NO_SNAPSHOT = { cached: null, revalidating: false };
const loadPublicContractOffers = vi.fn<(...args: unknown[]) => Promise<unknown>>(
  async () => NO_SNAPSHOT
);
vi.mock('@/features/contractSearch/publicContractOffers', () => ({
  loadPublicContractOffers: (...args: unknown[]) => loadPublicContractOffers(...args),
}));
const loadPublicCourierContracts = vi.fn<(...args: unknown[]) => Promise<unknown>>(
  async () => NO_SNAPSHOT
);
vi.mock('@/features/contractSearch/publicCourierContracts', () => ({
  loadPublicCourierContracts: (...args: unknown[]) => loadPublicCourierContracts(...args),
}));
vi.mock('@/features/character/location', () => ({
  loadCharacterSolarSystemId: vi.fn(async () => null),
}));

const loadCorpContractsSnapshot = vi.hoisted(() => vi.fn());
vi.mock('@/features/contracts/corpContractsSnapshot', () => ({ loadCorpContractsSnapshot }));

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
  ),
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/contacts`, () => HttpResponse.json([])),
  http.post('https://esi.evetech.net/characters/affiliation', () => HttpResponse.json([]))
);

beforeAll(async () => {
  server.listen({ onUnhandledRequest: 'error' });
  await routeChunks.loadLayout();
});

function renderContracts() {
  return renderPageRoute('/contracts', <Contracts />);
}
afterAll(() => server.close());
afterEach(() => server.resetHandlers());
beforeEach(async () => {
  await db.characters.clear();
  await db.tokens.clear();
  await db.settings.clear();
  await db.esiCache.clear();
  await db.contractArchive.clear();
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
  usePublicInfo.setState({ byCharacterId: {} });
  usePublicInfoModalStore.setState({ request: null });
  useTimeFormat.setState({ value: DEFAULT_TIME_FORMAT, hydrated: false });

  await db.characters.put({ characterId: CHAR_ID, name: 'Pilot One', ownerHash: 'oh', addedAt: 1 });
  await db.tokens.put({
    characterId: CHAR_ID,
    accessToken: 'access-token',
    refreshToken: 'refresh',
    expiresAt: Date.now() + 3_600_000,
    scopes: ['esi-contracts.read_character_contracts.v1'],
  });
  await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: CHAR_ID });
  window.history.pushState({}, '', '/contracts/history');
});

describe('Contracts', () => {
  it('renders every page from mocked ESI with resolved issuer name and a humanized status', async () => {
    renderContracts();
    expect(await screen.findByText('Rifter fit')).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Contracts' });
    expect(within(table).getAllByText('Courier')[0]).toBeInTheDocument();
    expect(screen.getAllByText(/Some Trader/).length).toBe(2);
    expect(within(table).getByText('Outstanding')).toBeInTheDocument();
    expect(within(table).getByText('Finished')).toBeInTheDocument();
  });

  it('keeps the static status off the accent colour and labels the amount column price / reward', async () => {
    renderContracts();
    await screen.findByText('Rifter fit');
    const table = screen.getByRole('table', { name: 'Contracts' });
    const outstanding = within(table).getByText('Outstanding').closest('td')!;
    expect(outstanding.className).toContain('text-text');
    expect(outstanding.className).not.toContain('text-accent');
    expect(
      within(table).getByRole('columnheader', { name: /Price \/ reward/ })
    ).toBeInTheDocument();
  });

  it('flags only a lapsed, unclaimed contract — not a finished one whose deadline has simply passed', async () => {
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
    renderContracts();
    await screen.findByText('Rifter fit');
    const table = screen.getByRole('table', { name: 'Contracts' });

    const cue = (row: Element | null | undefined) =>
      row?.querySelector('svg:not(button svg)') ?? null;

    const freshRow = within(table).getByText('Rifter fit').closest('tr');
    expect(cue(freshRow)).not.toBeInTheDocument();

    const staleRow = within(table).getByText('Lapsed offer').closest('tr');
    expect(cue(staleRow)).toBeInTheDocument();

    const finishedRow = within(table).getAllByText('Courier')[0].closest('tr');
    expect(cue(finishedRow)).not.toBeInTheDocument();
  });

  it('says what lapsed means in text, and lets the keyboard reach it', async () => {
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
    renderContracts();
    await screen.findByText('Rifter fit');
    const table = screen.getByRole('table', { name: 'Contracts' });
    const row = within(table).getByText('Lapsed offer').closest('tr') as HTMLElement;
    const lapsed = within(row).getByText(/past its deadline/i);
    expect(lapsed.parentElement).toHaveAttribute('tabindex', '0');
  });

  it('gives rows no More-actions button: Open in EVE lives in the contract detail', async () => {
    renderContracts();
    await screen.findByText('Rifter fit');
    expect(screen.queryAllByRole('button', { name: /^More actions/ })).toHaveLength(0);
  });

  it('opens the contract detail modal from ?open=<contractId>', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/contracts/1/items`, () =>
        HttpResponse.json([])
      )
    );
    window.history.pushState({}, '', '/contracts/history?open=1');
    renderContracts();
    const dialog = await screen.findByRole('dialog', { name: /Item Exchange/ });
    expect(within(dialog).getByText('Rifter fit')).toBeInTheDocument();
    await waitFor(() => expect(window.location.search).not.toContain('open='));
  });

  it('opens the detail sidebar and highlights the row from ?highlight=<contractId>', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/contracts/1/items`, () =>
        HttpResponse.json([])
      )
    );
    window.history.pushState({}, '', '/contracts/history?highlight=1');
    renderContracts();
    const dialog = await screen.findByRole('dialog', { name: /Item Exchange/ });
    expect(within(dialog).getByText('Rifter fit')).toBeInTheDocument();
    await waitFor(() => expect(window.location.search).not.toContain('highlight='));
  });

  it('opens nothing for a ?highlight= contract that never loads', async () => {
    window.history.pushState({}, '', '/contracts/history?highlight=987654');
    renderContracts();
    expect(await screen.findByText('Rifter fit')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      screen.getByText('This contract is older than 30 days, so EVE no longer lists it.')
    ).toBeInTheDocument();
  });

  it('lists an archived contract ESI no longer sends, and opens it from ?highlight=', async () => {
    await db.contractArchive.put({
      contract_id: 987654,
      issuer_id: 500001,
      issuer_corporation_id: 2,
      assignee_id: 3,
      acceptor_id: 0,
      type: 'item_exchange',
      status: 'finished',
      for_corporation: false,
      availability: 'personal',
      date_issued: '2026-01-01T00:00:00Z',
      date_expired: '2026-01-08T00:00:00Z',
      title: 'Old archived deal',
      characterId: CHAR_ID,
      archiveDate: '2026-01-08T00:00:00Z',
    });
    window.history.pushState({}, '', '/contracts/history?highlight=987654');
    renderContracts();
    expect(await screen.findByRole('dialog', { name: /Item Exchange/ })).toBeInTheDocument();
    expect(
      screen.queryByText('This contract is older than 30 days, so EVE no longer lists it.')
    ).not.toBeInTheDocument();
  });

  it('opens nothing for ?highlight= on a non-History tab, even after switching to History', async () => {
    const user = userEvent.setup();
    window.history.pushState({}, '', '/contracts/search/items?highlight=1');
    renderContracts();
    await user.click(await screen.findByRole('tab', { name: 'My contracts' }));
    expect(await screen.findByText('Rifter fit')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not reopen a ?highlight= contract once closed', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/contracts/1/items`, () =>
        HttpResponse.json([])
      )
    );
    const user = userEvent.setup();
    window.history.pushState({}, '', '/contracts/history?highlight=1');
    renderContracts();
    await screen.findByRole('dialog', { name: /Item Exchange/ });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('ignores an ?open= contract that never loads', async () => {
    window.history.pushState({}, '', '/contracts/history?open=987654');
    renderContracts();
    expect(await screen.findByText('Rifter fit')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens the contract detail modal on click', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/contracts/1/items`, () =>
        HttpResponse.json([])
      )
    );
    const user = userEvent.setup();
    renderContracts();
    await user.click(await screen.findByRole('button', { name: 'Rifter fit' }));
    const dialog = await screen.findByRole('dialog', { name: /Item Exchange/ });
    expect(within(dialog).getByText('Rifter fit')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Copy contract ID' })).toBeInTheDocument();
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
    renderContracts();
    expect(await screen.findByText('Rifter fit')).toBeInTheDocument();
    expect(screen.getByText(/showing cached data/i)).toBeInTheDocument();
  });

  it('shows the empty state when there is no data at all', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/contracts`, () =>
        HttpResponse.error()
      )
    );
    renderContracts();
    expect(await screen.findByText(/no contracts saved yet/i)).toBeInTheDocument();
  });

  it('says what fills the page when the character really has no contracts', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/contracts`, () =>
        HttpResponse.json([])
      )
    );
    renderContracts();
    expect(await screen.findByText('No contracts')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Contracts you issue or accept show here: item trades, couriers and auctions.'
      )
    ).toBeInTheDocument();
  });

  it('shows a re-login prompt (not a silent empty state) when the contracts scope was revoked', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/contracts`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      )
    );
    renderContracts();
    expect(await screen.findByText(/: log in again$/)).toBeInTheDocument();
    expect(screen.queryByText(/no contracts saved yet/i)).not.toBeInTheDocument();
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
    renderContracts();
    await screen.findByText('Rifter fit');
    const table = screen.getByRole('table', { name: 'Contracts' });
    const [issuerButton] = within(table).getAllByRole('link', { name: 'Some Trader' });
    await user.click(issuerButton);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('tab', { name: 'Character' })).toBeInTheDocument();
  });

  it('a status filter chip narrows the table to matching rows', async () => {
    const user = userEvent.setup();
    renderContracts();
    await screen.findByText('Rifter fit');
    const table = screen.getByRole('table', { name: 'Contracts' });
    expect(within(table).getAllByText('Courier')[0]).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    await user.click(screen.getByRole('button', { name: 'Outstanding' }));

    expect(within(table).getByText('Rifter fit')).toBeInTheDocument();
    expect(within(table).queryByText('Courier')).not.toBeInTheDocument();
  });

  it('search narrows contracts by title', async () => {
    const user = userEvent.setup();
    renderContracts();
    await screen.findByText('Rifter fit');
    const table = screen.getByRole('table', { name: 'Contracts' });

    await user.type(screen.getByPlaceholderText('Search issuer, receiver or title…'), 'rifter');

    expect(within(table).getByText('Rifter fit')).toBeInTheDocument();
    expect(within(table).queryByText('Courier')).not.toBeInTheDocument();
  });

  it('offers one-click Reset filters when the filters match no contract', async () => {
    const user = userEvent.setup();
    window.history.pushState({}, '', '/contracts/history');
    renderContracts();
    await screen.findByText('Rifter fit');

    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    await user.click(screen.getByRole('button', { name: 'Outstanding' }));
    await user.type(
      screen.getByPlaceholderText('Search issuer, receiver or title…'),
      'zzzznomatch'
    );

    expect(await screen.findByText('No contracts match your filters.')).toBeInTheDocument();
    expect(
      screen.queryByText('Clear the search or reset the status/type filters to see every contract.')
    ).not.toBeInTheDocument();
    await waitFor(() => expect(window.location.search).toContain('history.q=zzzznomatch'));

    await user.click(screen.getByRole('button', { name: 'Reset filters' }));

    const table = await screen.findByRole('table', { name: 'Contracts' });
    expect(within(table).getByText('Rifter fit')).toBeInTheDocument();
    expect(within(table).getAllByText('Courier')[0]).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search issuer, receiver or title…')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Outstanding' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    await waitFor(() => {
      const params = new URLSearchParams(window.location.search);
      expect(params.has('history.q')).toBe(false);
      expect(params.has('history.status')).toBe(false);
      expect(params.has('history.type')).toBe(false);
    });
  });

  it('Reset filters clears a search-only filter from the URL too', async () => {
    const user = userEvent.setup();
    renderContracts();
    await screen.findByText('Rifter fit');

    await user.type(
      screen.getByPlaceholderText('Search issuer, receiver or title…'),
      'zzzznomatch'
    );
    await waitFor(() => expect(window.location.search).toContain('history.q=zzzznomatch'));

    await user.click(screen.getByRole('button', { name: 'Reset filters' }));

    expect(await screen.findByText('Rifter fit')).toBeInTheDocument();
    await waitFor(() =>
      expect(new URLSearchParams(window.location.search).has('history.q')).toBe(false)
    );
  });

  it('on a narrow viewport, the filter sheet reopens cleared after Reset filters', async () => {
    stubViewport(NARROW_QUERY);
    const user = userEvent.setup();
    renderContracts();
    await screen.findAllByText('Rifter fit');

    await user.click(screen.getByRole('button', { name: 'Filters' }));
    let sheet = await screen.findByRole('dialog');
    await user.click(within(sheet).getByRole('button', { name: 'Outstanding' }));
    await user.keyboard('{Escape}');
    await user.type(
      screen.getByPlaceholderText('Search issuer, receiver or title…'),
      'zzzznomatch'
    );

    await user.click(await screen.findByRole('button', { name: 'Reset filters' }));
    await screen.findAllByText('Rifter fit');

    await user.click(screen.getByRole('button', { name: 'Filters' }));
    sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByRole('button', { name: 'Outstanding' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
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
    renderContracts();
    await screen.findByText('Rifter fit');
    expect(screen.getByText(/incomplete data/i)).toBeInTheDocument();
    const requestsBeforeRetry = page2Requests;

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(page2Requests).toBeGreaterThan(requestsBeforeRetry));
  });
});

describe('Contact standing cross-reference', () => {
  it('shows a standing tag next to a personally-blocked issuer', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/contacts`, () =>
        HttpResponse.json([
          { contact_id: 500001, contact_type: 'character', standing: -10, is_blocked: true },
        ])
      )
    );
    renderContracts();
    await screen.findByText('Rifter fit');
    const table = screen.getByRole('table', { name: 'Contracts' });
    expect(
      within(table).getAllByRole('img', { name: 'Your contact: Terrible standing (-10)' })
    ).toHaveLength(2);
  });

  it('shows no tag next to a stranger', async () => {
    renderContracts();
    await screen.findByText('Rifter fit');
    const table = screen.getByRole('table', { name: 'Contracts' });
    expect(within(table).queryByRole('img')).not.toBeInTheDocument();
  });

  it('still renders contracts when the contacts lookup itself fails', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/contacts`, () => HttpResponse.error())
    );
    renderContracts();
    expect(await screen.findByText('Rifter fit')).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Contracts' });
    expect(within(table).queryByRole('img')).not.toBeInTheDocument();
  });

  it("inherits the issuer's corp entry when the issuer has no personal contact of their own", async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/contacts`, () =>
        HttpResponse.json([{ contact_id: 2, contact_type: 'corporation', standing: -10 }])
      ),
      http.post('https://esi.evetech.net/characters/affiliation', () =>
        HttpResponse.json([{ character_id: 500001, corporation_id: 2 }])
      )
    );
    renderContracts();
    await screen.findByText('Rifter fit');
    const table = screen.getByRole('table', { name: 'Contracts' });
    expect(
      within(table).getAllByRole('img', {
        name: 'Terrible standing (-10) — your entry on their corp, not on them',
      })
    ).toHaveLength(2);
  });

  it('shows an Issued column and sorts newest-issued first by default', async () => {
    renderContracts();
    await screen.findByText('Rifter fit');
    const table = screen.getByRole('table', { name: 'Contracts' });
    const issued = within(table).getByRole('columnheader', { name: /Issued/ });
    expect(issued).toHaveAttribute('aria-sort', 'descending');
    expect(
      within(table).getByText(formatDateOnly(new Date(contractPage1[0].date_issued)))
    ).toBeInTheDocument();
  });

  it('carries the same standing tag into the contract detail modal', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/contracts/1/items`, () =>
        HttpResponse.json([])
      ),
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/contacts`, () =>
        HttpResponse.json([
          { contact_id: 500001, contact_type: 'character', standing: -10, is_blocked: true },
        ])
      )
    );
    const user = userEvent.setup();
    renderContracts();
    await user.click(await screen.findByRole('button', { name: 'Rifter fit' }));
    const dialog = await screen.findByRole('dialog', { name: /Item Exchange/ });
    expect(
      within(dialog).getByRole('img', { name: 'Your contact: Terrible standing (-10)' })
    ).toBeInTheDocument();
  });
});

describe('Received by column', () => {
  const base = contractPage1[0];
  it('shows the acceptor, the offered-to assignee with a tag, and a dash for the pilot', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/contracts`, () =>
        HttpResponse.json([
          {
            ...base,
            contract_id: 11,
            title: 'Accepted one',
            status: 'finished',
            acceptor_id: 600001,
          },
          { ...base, contract_id: 12, title: 'Offered one', assignee_id: 700001 },
          { ...base, contract_id: 13, title: 'Mine one', assignee_id: CHAR_ID },
        ])
      ),
      http.post('https://esi.evetech.net/universe/names', () =>
        HttpResponse.json([
          { id: 500001, name: 'Some Trader', category: 'character' },
          { id: 600001, name: 'Buyer Bob', category: 'character' },
          { id: 700001, name: 'Offered Olga', category: 'character' },
        ])
      )
    );
    renderContracts();
    await screen.findByText('Accepted one');
    const table = screen.getByRole('table', { name: 'Contracts' });
    expect(within(table).getByRole('link', { name: 'Buyer Bob' })).toBeInTheDocument();
    expect(within(table).getByRole('link', { name: 'Offered Olga' })).toBeInTheDocument();
    expect(within(table).getAllByText('(offered)')).toHaveLength(1);
    expect(within(table).getAllByText('—').length).toBeGreaterThanOrEqual(1);
  });
});

describe('Time format preference', () => {
  const EXPIRES = new Date(contractPage1[0].date_expired);
  const ORIGINAL_TZ = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = 'America/New_York';
  });
  afterEach(() => {
    process.env.TZ = ORIGINAL_TZ;
  });

  it('renders the Expires column in UTC when the stored preference is EVE time', async () => {
    expect(formatDateOnly(EXPIRES, 'UTC')).not.toBe(formatDateOnly(EXPIRES));
    await db.settings.put({ key: TIME_FORMAT_SETTING_KEY, value: 'eve' });

    renderContracts();
    await screen.findByText('Rifter fit');
    const table = screen.getByRole('table', { name: 'Contracts' });

    await waitFor(() =>
      expect(within(table).getByText(formatDateOnly(EXPIRES, 'UTC'))).toBeInTheDocument()
    );
    expect(within(table).queryByText(formatDateOnly(EXPIRES))).not.toBeInTheDocument();
  });

  it('reformats an already-rendered table when the pilot switches to EVE time', async () => {
    expect(formatDateOnly(EXPIRES, 'UTC')).not.toBe(formatDateOnly(EXPIRES));

    renderContracts();
    await screen.findByText('Rifter fit');
    const table = screen.getByRole('table', { name: 'Contracts' });
    expect(within(table).getByText(formatDateOnly(EXPIRES))).toBeInTheDocument();

    await act(async () => {
      await useTimeFormat.getState().setValue('eve');
    });

    expect(within(table).getByText(formatDateOnly(EXPIRES, 'UTC'))).toBeInTheDocument();
    expect(within(table).queryByText(formatDateOnly(EXPIRES))).not.toBeInTheDocument();
  });
});

const CORP_SCOPES = [
  'esi-contracts.read_character_contracts.v1',
  'esi-contracts.read_corporation_contracts.v1',
];

describe('Contracts corp source', () => {
  beforeEach(() => {
    loadCorpContractsSnapshot.mockReset();
    loadCorpContractsSnapshot.mockResolvedValue({
      corporationId: 77,
      contractsResult: {
        data: [{ ...contractPage1[0], contract_id: 90, title: 'Corp haul' }],
        fetchedAt: new Date(),
        fromCache: false,
        truncated: false,
      },
      needsReauth: false,
      truncated: false,
      names: new Map([[500001, 'Some Trader']]),
      receiverCategories: new Map(),
    });
  });

  it('shows the corp contracts for ?scope=corp without reading the Character contracts', async () => {
    let characterReads = 0;
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/contracts`, () => {
        characterReads += 1;
        return HttpResponse.json([]);
      })
    );
    await db.tokens.update(CHAR_ID, { scopes: CORP_SCOPES });
    window.history.pushState({}, '', '/contracts/history?scope=corp');
    renderContracts();
    expect(await screen.findByText('Corp haul')).toBeInTheDocument();
    expect(screen.queryByText('Rifter fit')).not.toBeInTheDocument();
    expect(characterReads).toBe(0);
  });

  it('switches from the Character picker and back, in the same table', async () => {
    await db.tokens.update(CHAR_ID, { scopes: CORP_SCOPES });
    window.history.pushState({}, '', '/contracts/history');
    const user = userEvent.setup();
    renderContracts();
    await screen.findByText('Rifter fit');
    await user.click(screen.getByRole('button', { name: 'This character' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Corporation' }));
    expect(await screen.findByText('Corp haul')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Contracts' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Status' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Character' })).not.toBeInTheDocument();
    expect(window.location.search).toBe('?scope=corp');
    await user.click(screen.getByRole('button', { name: 'Corporation' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'This character' }));
    expect(await screen.findByText('Rifter fit')).toBeInTheDocument();
    expect(window.location.search).toBe('');
  });
});

describe('Contracts All characters source', () => {
  const ALT_ID = 92;
  beforeEach(async () => {
    await db.characters.put({
      characterId: ALT_ID,
      name: 'Pilot Two',
      ownerHash: 'o2',
      addedAt: 2,
    });
    await db.tokens.put({
      characterId: ALT_ID,
      accessToken: 'access-token',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 3_600_000,
      scopes: ['esi-contracts.read_character_contracts.v1'],
    });
    server.use(
      http.get(`https://esi.evetech.net/characters/${ALT_ID}/contracts`, () =>
        HttpResponse.json([
          contractPage1[0],
          { ...contractPage1[0], contract_id: 77, title: 'Alt trade' },
        ])
      )
    );
  });

  it("lists every Character's contracts once, with a Character column only here", async () => {
    window.history.pushState({}, '', '/contracts/history?history.chars=all');
    renderContracts();
    expect(await screen.findByText('Alt trade')).toBeInTheDocument();
    expect(screen.getAllByText('Rifter fit')).toHaveLength(1);
    expect(screen.getByRole('columnheader', { name: 'Character' })).toBeInTheDocument();
  });

  it('names a Character who has not shared contracts in the picker, not in a body note', async () => {
    await db.characters.put({
      characterId: 93,
      name: 'Pilot Three',
      ownerHash: 'o3',
      addedAt: 3,
    });
    window.history.pushState({}, '', '/contracts/history?history.chars=all');
    renderContracts();
    expect(await screen.findByText('Alt trade')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^All characters.*Not included: Pilot Three$/ })
    ).toBeInTheDocument();
    expect(screen.queryByText(/hasn't shared their contracts/)).not.toBeInTheDocument();
  });

  it('has no Character column for This character', async () => {
    window.history.pushState({}, '', '/contracts/history');
    renderContracts();
    await screen.findByText('Rifter fit');
    expect(screen.queryByRole('columnheader', { name: 'Character' })).not.toBeInTheDocument();
  });

  it('offers This character and All characters', async () => {
    window.history.pushState({}, '', '/contracts/history');
    const user = userEvent.setup();
    renderContracts();
    await screen.findByText('Rifter fit');
    await user.click(screen.getByRole('button', { name: 'This character' }));
    expect(
      screen.getAllByRole('menuitemradio').map((el) => el.textContent?.replace(/^✓/, ''))
    ).toEqual(['This character', 'All characters · 2']);
  });
});

describe('Contracts row right-click (issue #676)', () => {
  async function openContractMenu(cellText: string) {
    await screen.findByText('Rifter fit');
    const table = screen.getByRole('table', { name: 'Contracts' });
    const row = within(table).getByText(cellText).closest('tr');
    if (!row) throw new Error(`expected a "${cellText}" contract row`);
    row.focus();
    fireEvent.contextMenu(row);
    return row;
  }

  it('has no row menu: no Open in EVE, no row copies and no modal on right-click', async () => {
    renderContracts();
    await openContractMenu('Rifter fit');

    expect(screen.queryByRole('menuitem', { name: 'Open in EVE' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Copy title' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Copy contract ID' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(openContractMock).not.toHaveBeenCalled();
  });

  it('left-click on the title cell still opens the detail modal, unaffected by the context menu', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/contracts/1/items`, () =>
        HttpResponse.json([])
      )
    );
    const user = userEvent.setup();
    renderContracts();
    await user.click(await screen.findByText('Rifter fit'));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});

describe('Contracts tab strip (issue #908)', () => {
  const SEARCH_UNAVAILABLE = "Can't reach contract search, and nothing is saved yet";

  it('lands on My contracts with no tab in the URL', async () => {
    window.history.pushState({}, '', '/contracts');
    renderContracts();
    expect(await screen.findByText('Rifter fit')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'My contracts' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(window.location.pathname).toBe('/contracts/history');
  });

  it('swaps the public search for the contracts table when My contracts is picked', async () => {
    const user = userEvent.setup();
    window.history.pushState({}, '', '/contracts/search/items');
    renderContracts();
    await screen.findAllByText(SEARCH_UNAVAILABLE);

    await user.click(screen.getByRole('tab', { name: 'My contracts' }));

    expect(await screen.findByText('Rifter fit')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/contracts/history');
  });

  it('opens History from a deep link, and returns to Item search on the way back', async () => {
    const user = userEvent.setup();
    renderContracts();

    expect(await screen.findByText('Rifter fit')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'My contracts' })).toHaveAttribute(
      'aria-selected',
      'true'
    );

    await user.click(screen.getByRole('tab', { name: 'Item search' }));

    expect(await screen.findAllByText(SEARCH_UNAVAILABLE)).not.toHaveLength(0);
    expect(window.location.pathname).toBe('/contracts/search/items');
  });

  it('ignores an older `?tab=search` link and lands on the default tab', async () => {
    window.history.pushState({}, '', '/contracts?tab=search');
    renderContracts();

    expect(await screen.findByText('Rifter fit')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/contracts/history');
  });

  it('reaches Item search even when this character has no contracts of its own', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/contracts`, () =>
        HttpResponse.json([], { headers: { 'X-Pages': '1' } })
      )
    );
    const user = userEvent.setup();
    renderContracts();
    expect(await screen.findByText(/^no contracts$/i)).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Item search' }));

    expect(await screen.findAllByText(SEARCH_UNAVAILABLE)).not.toHaveLength(0);
    expect(screen.queryByText(/^no contracts$/i)).not.toBeInTheDocument();
  });

  it('reaches Item search even when the contracts scope was revoked', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/contracts`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      )
    );
    const user = userEvent.setup();
    renderContracts();
    expect(await screen.findByText(/: log in again$/)).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Item search' }));

    expect(await screen.findAllByText(SEARCH_UNAVAILABLE)).not.toHaveLength(0);
    expect(screen.queryByText(/: log in again$/)).not.toBeInTheDocument();
  });
});

describe('Contracts Search tab page header', () => {
  const SYNCED_AT = Date.parse('2026-09-12T18:30:00Z');
  const EMPTY_SNAPSHOT = {
    cached: {
      data: { rows: [], lastSyncedAt: SYNCED_AT },
      fetchedAt: new Date(SYNCED_AT),
      fromCache: false,
      truncated: false,
    },
    revalidating: false,
  };

  beforeEach(() => {
    loadPublicContractOffers.mockResolvedValue(EMPTY_SNAPSHOT);
    loadPublicCourierContracts.mockResolvedValue(EMPTY_SNAPSHOT);
  });

  afterEach(() => {
    loadPublicContractOffers.mockImplementation(async () => NO_SNAPSHOT);
    loadPublicCourierContracts.mockImplementation(async () => NO_SNAPSHOT);
  });

  it("shows the public snapshot's age beside the page title, and an enabled Refresh", async () => {
    window.history.pushState({}, '', '/contracts/search/items');
    const { container } = renderContracts();

    await waitFor(() =>
      expect(
        container.querySelector(`time[datetime="${new Date(SYNCED_AT).toISOString()}"]`)
      ).not.toBeNull()
    );
    expect(screen.getByRole('button', { name: 'Refresh' })).not.toHaveAttribute('aria-disabled');
  });

  it('picks Item search, Courier and History from one tab row, with no switch in the panel', async () => {
    const user = userEvent.setup();
    window.history.pushState({}, '', '/contracts/search/items');
    renderContracts();

    const tabs = await screen.findByRole('tablist', { name: 'Contracts sections' });
    expect(
      within(tabs)
        .getAllByRole('tab')
        .map((tab) => tab.textContent)
    ).toEqual(['My contracts', 'Item search', 'Courier']);
    expect(screen.queryByRole('group', { name: 'Contract kind' })).not.toBeInTheDocument();

    await user.click(within(tabs).getByRole('tab', { name: 'Courier' }));

    expect(within(tabs).getByRole('tab', { name: 'Courier' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(window.location.pathname).toBe('/contracts/search/courier');
  });
});

describe('Issued / Expires date-only cells (issue #3105)', () => {
  const base = contractPage1[0];

  it('shows a date without the time, with the full timestamp on a tooltip', async () => {
    const user = userEvent.setup();
    renderContracts();
    await screen.findByText('Rifter fit');
    const table = screen.getByRole('table', { name: 'Contracts' });
    const issued = new Date(base.date_issued);
    const cell = within(table).getByText(formatDateOnly(issued));
    expect(within(table).queryByText(formatTimestamp(issued))).not.toBeInTheDocument();
    await user.hover(cell);
    expect((await screen.findAllByText(formatTimestamp(issued))).length).toBeGreaterThan(0);
  });

  it('sorts same-day contracts by their full timestamp', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/contracts`, () =>
        HttpResponse.json([
          { ...base, contract_id: 21, title: 'Morning one', date_issued: '2026-08-01T01:00:00Z' },
          { ...base, contract_id: 22, title: 'Evening one', date_issued: '2026-08-01T23:00:00Z' },
        ])
      )
    );
    renderContracts();
    await screen.findByText('Morning one');
    const table = screen.getByRole('table', { name: 'Contracts' });
    const names = () =>
      within(table)
        .getAllByRole('button', { name: /one$/ })
        .map((b) => b.textContent);
    expect(names()).toEqual(['Evening one', 'Morning one']);
    fireEvent.click(
      within(table)
        .getByRole('columnheader', { name: /Issued/ })
        .querySelector('button')!
    );
    expect(names()).toEqual(['Morning one', 'Evening one']);
  });

  it('exposes a title in full through a tooltip on its opener', async () => {
    const user = userEvent.setup();
    renderContracts();
    await screen.findByText('Rifter fit');
    await user.hover(screen.getByRole('button', { name: 'Rifter fit' }));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Rifter fit');
  });
});

describe('Contracts in the App', () => {
  it('opens /contracts/history inside the signed-in shell, its rail link current', async () => {
    render(<App />);
    expect(await screen.findByText('Rifter fit')).toBeInTheDocument();
    const rail = (await screen.findAllByRole('navigation'))[0];
    expect(await within(rail).findByRole('link', { name: 'Contracts' })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });
});
