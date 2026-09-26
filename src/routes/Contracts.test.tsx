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
import {
  DEFAULT_CONTRACT_SEARCH_MODE,
  useContractSearchMode,
} from '@/features/contractSearch/contractSearchModePref';
import { formatTimestamp } from '@/lib/timestamp';
import { isSyncConfigured } from '@/app/syncStatus';
import { App } from '@/app/App';
import { PHONE_QUERY } from '@/lib/useIsPhone';
import { NARROW_QUERY } from '@/lib/useIsNarrow';

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

// The Search tab reads a Firestore snapshot. Forced off here so this file
// stays about the tab strip and the character-contracts table: whether a sync
// backend is configured otherwise depends on whether a `.env` happens to sit
// beside the checkout, which would make these tests environment-dependent.
// `ContractSearchPanel.test.tsx` covers the configured path.
vi.mock('@/app/syncStatus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app/syncStatus')>();
  return { ...actual, isSyncConfigured: vi.fn(() => false) };
});

// Only ever reached by the Search-tab header case at the bottom of this file,
// which turns `isSyncConfigured` back on; everywhere else the mock above keeps
// the panel out of these loaders entirely.
const loadPublicContractOffers = vi.fn();
vi.mock('@/features/contractSearch/publicContractOffers', () => ({
  loadPublicContractOffers: (...args: unknown[]) => loadPublicContractOffers(...args),
}));
const loadPublicCourierContracts = vi.fn();
vi.mock('@/features/contractSearch/publicCourierContracts', () => ({
  loadPublicCourierContracts: (...args: unknown[]) => loadPublicCourierContracts(...args),
}));
// The Search tab's Jump Range filter reads this (`features/route/currentSystem.ts`).
// Mocked rather than given an msw handler: `onUnhandledRequest: 'error'` below
// would otherwise fail every case that mounts the Search tab, not only the
// ones this file is actually about.
vi.mock('@/features/character/location', () => ({
  loadCharacterSolarSystemId: vi.fn(async () => null),
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

/** Every filter now sits behind the funnel (FilterBar, issue #1282). */
function openFilters() {
  fireEvent.click(screen.getByRole('button', { name: /^Filters/ }));
}

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
  // No contacts and no affiliation by default — standing cross-reference
  // tests below override these per-scenario.
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/contacts`, () => HttpResponse.json([])),
  http.post('https://esi.evetech.net/characters/affiliation', () => HttpResponse.json([]))
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
  // Module singleton, shared by every test in this file: without the reset a
  // preference set by one test leaves the rest rendering UTC, and a leaked
  // `hydrated: true` makes App's `hydrate()` early-return.
  useTimeFormat.setState({ value: DEFAULT_TIME_FORMAT, hydrated: false });
  // Same reset, same reason: a mode picked in one case (issue #1719) must not
  // survive into the next as a remembered default that overrides a bare
  // `/contracts` visit's own "lands on Items" assertion.
  useContractSearchMode.setState({ value: DEFAULT_CONTRACT_SEARCH_MODE, hydrated: false });

  await db.characters.put({ characterId: CHAR_ID, name: 'Pilot One', ownerHash: 'oh', addedAt: 1 });
  await db.tokens.put({
    characterId: CHAR_ID,
    accessToken: 'access-token',
    refreshToken: 'refresh',
    expiresAt: Date.now() + 3_600_000,
    scopes: ['esi-contracts.read_character_contracts.v1'],
  });
  await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: CHAR_ID });
  // Search is the page's landing tab; every describe below this one is about
  // the character's own contract history, so they deep-link straight to it.
  // The tab-strip describe overrides this per test.
  window.history.pushState({}, '', '/contracts/history');
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

  it('keeps the static status off the accent colour and labels the amount column price / reward', async () => {
    render(<App />);
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
    render(<App />);
    await screen.findByText('Rifter fit');
    const table = screen.getByRole('table', { name: 'Contracts' });

    const freshRow = within(table).getByText('Rifter fit').closest('tr');
    expect(freshRow?.querySelector('svg')).not.toBeInTheDocument();

    // Lapsed rows carry a non-color cue (icon + tooltip) rather than dimming
    // the row's own text below AA (issue #1491).
    const staleRow = within(table).getByText('Lapsed offer').closest('tr');
    expect(staleRow?.querySelector('svg')).toBeInTheDocument();

    // Finished, with a deadline in the past — not flagged (issue: was
    // status-blind, so almost every completed contract dimmed).
    const finishedRow = within(table).getByText('Courier').closest('tr');
    expect(finishedRow?.querySelector('svg')).not.toBeInTheDocument();
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

    openFilters();
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

  it('offers one-click Reset filters when the filters match no contract', async () => {
    const user = userEvent.setup();
    window.history.pushState({}, '', '/contracts/history');
    render(<App />);
    await screen.findByText('Rifter fit');

    openFilters();
    await user.click(screen.getByRole('button', { name: 'Outstanding' }));
    await user.type(screen.getByPlaceholderText('Search issuer or title…'), 'zzzznomatch');

    expect(await screen.findByText('No contracts match your filters.')).toBeInTheDocument();
    expect(
      screen.getByText('No contract matches the current search and filters.')
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Clear the search or reset the status/type filters to see every contract.')
    ).not.toBeInTheDocument();
    await waitFor(() => expect(window.location.search).toContain('history.q=zzzznomatch'));

    await user.click(screen.getByRole('button', { name: 'Reset filters' }));

    const table = await screen.findByRole('table', { name: 'Contracts' });
    expect(within(table).getByText('Rifter fit')).toBeInTheDocument();
    expect(within(table).getByText('Courier')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search issuer or title…')).toHaveValue('');
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
    render(<App />);
    await screen.findByText('Rifter fit');

    await user.type(screen.getByPlaceholderText('Search issuer or title…'), 'zzzznomatch');
    await waitFor(() => expect(window.location.search).toContain('history.q=zzzznomatch'));

    await user.click(screen.getByRole('button', { name: 'Reset filters' }));

    expect(await screen.findByText('Rifter fit')).toBeInTheDocument();
    await waitFor(() =>
      expect(new URLSearchParams(window.location.search).has('history.q')).toBe(false)
    );
  });

  it('on a narrow viewport, the filter sheet reopens cleared after Reset filters', async () => {
    const real = window.matchMedia;
    window.matchMedia = ((media: string) =>
      ({
        media,
        matches: media === NARROW_QUERY,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList) as typeof window.matchMedia;
    try {
      const user = userEvent.setup();
      render(<App />);
      await screen.findAllByText('Rifter fit');

      await user.click(screen.getByRole('button', { name: 'Filters' }));
      let sheet = await screen.findByRole('dialog');
      await user.click(within(sheet).getByRole('button', { name: 'Outstanding' }));
      await user.click(within(sheet).getByRole('button', { name: 'Apply' }));
      await user.type(screen.getByPlaceholderText('Search issuer or title…'), 'zzzznomatch');

      await user.click(await screen.findByRole('button', { name: 'Reset filters' }));
      await screen.findAllByText('Rifter fit');

      await user.click(screen.getByRole('button', { name: 'Filters' }));
      sheet = await screen.findByRole('dialog');
      expect(within(sheet).getByRole('button', { name: 'Outstanding' })).toHaveAttribute(
        'aria-pressed',
        'false'
      );
    } finally {
      window.matchMedia = real;
    }
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
    render(<App />);
    await screen.findByText('Rifter fit');
    const table = screen.getByRole('table', { name: 'Contracts' });
    // Both fixture contracts share issuer_id 500001 — both rows carry the tag.
    expect(
      within(table).getAllByRole('img', { name: 'Your contact: Terrible standing (-10)' })
    ).toHaveLength(2);
  });

  it('shows no tag next to a stranger', async () => {
    render(<App />);
    await screen.findByText('Rifter fit');
    const table = screen.getByRole('table', { name: 'Contracts' });
    expect(within(table).queryByRole('img')).not.toBeInTheDocument();
  });

  /**
   * The contacts scope may never have been granted at all (this route never
   * asks for it) — a network failure on that one lookup must not take the
   * whole page down with it, the same way an offline contracts fetch falls
   * back to cache rather than failing the page (`loadPaginatedWithCacheStatus`
   * catches internally; this proves the `Promise.all` alongside it inherits
   * that, not just the contracts call on its own).
   */
  it('still renders contracts when the contacts lookup itself fails', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/contacts`, () => HttpResponse.error())
    );
    render(<App />);
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
    render(<App />);
    await screen.findByText('Rifter fit');
    const table = screen.getByRole('table', { name: 'Contracts' });
    // Both fixture contracts share issuer_id 500001 — both rows carry the tag.
    expect(
      within(table).getAllByRole('img', {
        name: 'Terrible standing (-10) — your entry on their corp, not on them',
      })
    ).toHaveLength(2);
  });

  it('shows an Issued column and sorts newest-issued first by default', async () => {
    render(<App />);
    await screen.findByText('Rifter fit');
    const table = screen.getByRole('table', { name: 'Contracts' });
    const issued = within(table).getByRole('columnheader', { name: /Issued/ });
    expect(issued).toHaveAttribute('aria-sort', 'descending');
    expect(
      within(table).getByText(formatTimestamp(new Date(contractPage1[0].date_issued)))
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
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Rifter fit' }));
    const dialog = await screen.findByRole('dialog', { name: 'Rifter fit' });
    expect(
      within(dialog).getByRole('img', { name: 'Your contact: Terrible standing (-10)' })
    ).toBeInTheDocument();
  });
});

/**
 * Vitest pins `TZ=UTC` (vite.config.ts), under which
 * `formatTimestamp(d, 'UTC')` and `formatTimestamp(d)` are the same string —
 * so a Contracts page that ignored the preference outright would still pass
 * these. Both tests move the host zone off UTC for their duration, and the
 * guard assertion in each states that premise out loud so this can never
 * quietly go vacuous if the config's zone ever changes.
 */
describe('Time format preference', () => {
  /** The instant is fixed; only its rendering depends on the zone below. */
  const EXPIRES = new Date(contractPage1[0].date_expired);
  const ORIGINAL_TZ = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = 'America/New_York';
  });
  afterEach(() => {
    process.env.TZ = ORIGINAL_TZ;
  });

  it('renders the Expires column in UTC when the stored preference is EVE time', async () => {
    expect(formatTimestamp(EXPIRES, 'UTC')).not.toBe(formatTimestamp(EXPIRES));
    await db.settings.put({ key: TIME_FORMAT_SETTING_KEY, value: 'eve' });

    render(<App />);
    await screen.findByText('Rifter fit');
    const table = screen.getByRole('table', { name: 'Contracts' });

    await waitFor(() =>
      expect(within(table).getByText(formatTimestamp(EXPIRES, 'UTC'))).toBeInTheDocument()
    );
    expect(within(table).queryByText(formatTimestamp(EXPIRES))).not.toBeInTheDocument();
  });

  /**
   * The column set is a `useMemo`. Mounting with the preference already set
   * would pass even if `timeZone` were missing from its deps — the memo would
   * simply have closed over the right zone once. Flipping it *after* mount is
   * what actually proves the table re-renders instead of holding stale strings.
   */
  it('reformats an already-rendered table when the pilot switches to EVE time', async () => {
    expect(formatTimestamp(EXPIRES, 'UTC')).not.toBe(formatTimestamp(EXPIRES));

    render(<App />);
    await screen.findByText('Rifter fit');
    const table = screen.getByRole('table', { name: 'Contracts' });
    expect(within(table).getByText(formatTimestamp(EXPIRES))).toBeInTheDocument();

    // The store's own setter, exactly as a Settings control would call it —
    // it takes the hydration generation, so App's in-flight `hydrate()`
    // cannot land afterwards and undo the choice.
    await act(async () => {
      await useTimeFormat.getState().setValue('eve');
    });

    expect(within(table).getByText(formatTimestamp(EXPIRES, 'UTC'))).toBeInTheDocument();
    expect(within(table).queryByText(formatTimestamp(EXPIRES))).not.toBeInTheDocument();
  });
});

describe('Contracts row context menu (issue #676)', () => {
  /** Right-clicks a contract row by its rendered title-cell text and returns the row. */
  async function openContractMenu(cellText: string) {
    await screen.findByText('Rifter fit');
    const table = screen.getByRole('table', { name: 'Contracts' });
    const row = within(table).getByText(cellText).closest('tr');
    if (!row) throw new Error(`expected a "${cellText}" contract row`);
    row.focus();
    fireEvent.contextMenu(row);
    return row;
  }

  it('offers Copy title and Copy Contract ID, without opening the detail modal', async () => {
    render(<App />);
    await openContractMenu('Rifter fit');

    expect(screen.getByRole('menuitem', { name: 'Copy title' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Copy contract ID' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('offers the menu on a titleless contract, keyed off its type-label fallback', async () => {
    render(<App />);
    await openContractMenu('Courier');

    expect(screen.getByRole('menuitem', { name: 'Copy title' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Copy contract ID' })).toBeInTheDocument();
  });

  it('left-click on the title cell still opens the detail modal, unaffected by the context menu', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/contracts/1/items`, () =>
        HttpResponse.json([])
      )
    );
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByText('Rifter fit'));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});

describe('Contracts tab strip (issue #908)', () => {
  const SEARCH_UNAVAILABLE = "Contract search isn't available";

  it('lands on Search Items with no tab in the URL', async () => {
    window.history.pushState({}, '', '/contracts');
    render(<App />);
    expect(await screen.findByText(SEARCH_UNAVAILABLE)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Search' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('table', { name: 'Contracts' })).not.toBeInTheDocument();
    expect(window.location.pathname).toBe('/contracts/search/items');
  });

  it('remembers the last-used Courier mode across a fresh visit (issue #1719)', async () => {
    useContractSearchMode.setState({ value: 'courier', hydrated: true });
    window.history.pushState({}, '', '/contracts');
    render(<App />);
    expect(await screen.findByText(SEARCH_UNAVAILABLE)).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe('/contracts/search/courier'));
  });

  it('still lands on Items when the remembered mode is Items itself', async () => {
    useContractSearchMode.setState({ value: 'items', hydrated: true });
    window.history.pushState({}, '', '/contracts');
    render(<App />);
    expect(await screen.findByText(SEARCH_UNAVAILABLE)).toBeInTheDocument();
    expect(window.location.pathname).toBe('/contracts/search/items');
  });

  it('never overrides an explicit deep link to Search Items with a remembered Courier mode', async () => {
    // `tabId` reads identically for this and a bare `/contracts` visit
    // (issue #1719) — only `TabRoute`'s own `tabRouteDefaulted` marker tells
    // them apart, and a URL that already names a real tab never gets one.
    useContractSearchMode.setState({ value: 'courier', hydrated: true });
    window.history.pushState({}, '', '/contracts/search/items');
    render(<App />);
    expect(await screen.findByText(SEARCH_UNAVAILABLE)).toBeInTheDocument();
    expect(window.location.pathname).toBe('/contracts/search/items');
  });

  it('restores the remembered Courier mode via replace, leaving no extra history entry', async () => {
    useContractSearchMode.setState({ value: 'courier', hydrated: true });
    window.history.pushState({}, '', '/contracts');
    const historyLengthBeforeRender = window.history.length;
    render(<App />);
    expect(await screen.findByText(SEARCH_UNAVAILABLE)).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe('/contracts/search/courier'));
    // Neither TabRoute's own redirect nor the mode restore push — Back from
    // Courier must land wherever the pilot was before this page, not on Items.
    expect(window.history.length).toBe(historyLengthBeforeRender);
  });

  it('leaves the History tab alone regardless of the remembered Search mode', async () => {
    useContractSearchMode.setState({ value: 'courier', hydrated: true });
    // beforeEach above already deep-links to History; restated for clarity.
    window.history.pushState({}, '', '/contracts/history');
    render(<App />);
    expect(await screen.findByText('Rifter fit')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/contracts/history');
  });

  it('swaps the public search for the contracts table when History is picked', async () => {
    const user = userEvent.setup();
    window.history.pushState({}, '', '/contracts');
    render(<App />);
    await screen.findByText(SEARCH_UNAVAILABLE);

    await user.click(screen.getByRole('tab', { name: 'History' }));

    expect(await screen.findByText('Rifter fit')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/contracts/history');
  });

  it('opens History from a deep link, and returns to Search Items on the way back', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByText('Rifter fit')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'History' })).toHaveAttribute('aria-selected', 'true');

    await user.click(screen.getByRole('tab', { name: 'Search' }));

    expect(await screen.findByText(SEARCH_UNAVAILABLE)).toBeInTheDocument();
    expect(window.location.pathname).toBe('/contracts/search/items');
  });

  it('ignores an older `?tab=search` link and lands on the default tab', async () => {
    window.history.pushState({}, '', '/contracts?tab=search');
    render(<App />);

    expect(await screen.findByText(SEARCH_UNAVAILABLE)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Search' })).toHaveAttribute('aria-selected', 'true');
    expect(window.location.pathname).toBe('/contracts/search/items');
  });

  it('reaches Search even when this character has no contracts of its own', async () => {
    // The empty-history state used to be the whole page; the Search tab reads
    // a public snapshot and must not be gated behind it.
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/contracts`, () =>
        HttpResponse.json([], { headers: { 'X-Pages': '1' } })
      )
    );
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByText(/^no contracts$/i)).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Search' }));

    expect(await screen.findByText(SEARCH_UNAVAILABLE)).toBeInTheDocument();
    expect(screen.queryByText(/^no contracts$/i)).not.toBeInTheDocument();
  });

  it('reaches Search even when the contracts scope was revoked', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/contracts`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      )
    );
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByText('Log in again to see your contracts')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Search' }));

    expect(await screen.findByText(SEARCH_UNAVAILABLE)).toBeInTheDocument();
    expect(screen.queryByText('Log in again to see your contracts')).not.toBeInTheDocument();
  });
});

/**
 * The Search tab's freshness badge and Refresh live on the *page* header, not
 * in the results panel — `ContractSearchPanel` reports them upward. Only a
 * route-level render proves that round trip: the panel's own suite stubs the
 * page header, so a callback that never fired would still pass there.
 */
describe('Contracts Search tab page header', () => {
  const SYNCED_AT = Date.parse('2026-09-12T18:30:00Z');
  /** No rows, so neither board pulls the SDE catalogue — the header is what is under test. */
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
    vi.mocked(isSyncConfigured).mockReturnValue(true);
    loadPublicContractOffers.mockReset();
    loadPublicContractOffers.mockResolvedValue(EMPTY_SNAPSHOT);
    loadPublicCourierContracts.mockReset();
    loadPublicCourierContracts.mockResolvedValue(EMPTY_SNAPSHOT);
  });

  afterEach(() => {
    vi.mocked(isSyncConfigured).mockReturnValue(false);
  });

  it("shows the public snapshot's age beside the page title, and an enabled Refresh", async () => {
    window.history.pushState({}, '', '/contracts/search/items');
    const { container } = render(<App />);

    // The panel drew this pair itself before; it now has to reach the route.
    await waitFor(() =>
      expect(
        container.querySelector(`time[datetime="${new Date(SYNCED_AT).toISOString()}"]`)
      ).not.toBeNull()
    );
    // Enabled is the discriminating assertion: no reported status leaves it off.
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled();
  });

  it('puts the Items/Courier switch in the results panel header the badge vacated', async () => {
    window.history.pushState({}, '', '/contracts/search/items');
    render(<App />);

    const modes = await screen.findByRole('group', { name: 'Contract kind' });
    expect(within(modes).getByRole('button', { name: 'Items' })).toBeInTheDocument();
    expect(within(modes).getByRole('button', { name: 'Courier' })).toBeInTheDocument();
    // Desktop keeps it in the panel's own header strip — Panel is the only
    // `<section>` on the page.
    expect(modes.closest('section')).not.toBeNull();
  });

  describe('on a phone', () => {
    let restore: () => void;
    beforeEach(() => {
      const real = window.matchMedia;
      window.matchMedia = ((media: string) =>
        ({
          media,
          matches: media === PHONE_QUERY,
          onchange: null,
          addEventListener: () => {},
          removeEventListener: () => {},
          addListener: () => {},
          removeListener: () => {},
          dispatchEvent: () => false,
        }) as unknown as MediaQueryList) as typeof window.matchMedia;
      restore = () => {
        window.matchMedia = real;
      };
    });
    afterEach(() => restore());

    it('moves the Items/Courier switch up into the tab row, out of the panel', async () => {
      const user = userEvent.setup();
      window.history.pushState({}, '', '/contracts/search/items');
      render(<App />);

      const modes = await screen.findByRole('group', { name: 'Contract kind' });
      await waitFor(() => expect(modes.closest('section')).toBeNull());
      // The tablist's scroller sits in the same row wrapper as the switch.
      const tabRow = screen.getByRole('tablist', { name: 'Contracts sections' }).parentElement
        ?.parentElement;
      expect(tabRow).toContainElement(modes);
      // One switch, not a portalled copy beside a hidden header one.
      expect(screen.getAllByRole('button', { name: 'Courier' })).toHaveLength(1);

      await user.click(within(modes).getByRole('button', { name: 'Courier' }));
      expect(within(modes).getByRole('button', { name: 'Courier' })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      expect(within(modes).getByRole('button', { name: 'Items' })).toHaveAttribute(
        'aria-pressed',
        'false'
      );
    });
  });
});
