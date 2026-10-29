import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { mswServer } from '@/test/msw';
import '@/i18n';
import { db } from '@/db';
import { STALE_FETCHED_AT } from '@/esi/cacheFixtures';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { writeRouteSnapshot } from '@/lib/routeSnapshotCache';
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
  loadMarketWideTrees: vi.fn(async () => ({})),
}));

const CHAR_ID = 91;

const history = [
  { record_id: 2, corporation_id: 200, start_date: '2026-01-01T00:00:00Z' },
  { record_id: 1, corporation_id: 100, start_date: '2025-01-01T00:00:00Z' },
];

let skillCalls = 0;

const server = mswServer(
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/corporationhistory`, () =>
    HttpResponse.json(history)
  ),
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/skills`, () => {
    skillCalls += 1;
    return HttpResponse.json({ skills: [], total_sp: 1_000, unallocated_sp: 0 });
  }),
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}`, () =>
    HttpResponse.json({
      name: 'Pilot One',
      corporation_id: 200,
      birthday: '2015-01-01T00:00:00Z',
      bloodline_id: 1,
      gender: 'female',
      race_id: 1,
    })
  ),
  http.get('https://esi.evetech.net/corporations/200', () =>
    HttpResponse.json({
      name: 'Current Corp',
      ticker: 'CC',
      ceo_id: 1,
      creator_id: 1,
      member_count: 5,
      tax_rate: 0.1,
    })
  ),
  http.post('https://esi.evetech.net/universe/names', () =>
    HttpResponse.json([
      { id: 200, name: 'Current Corp', category: 'corporation' },
      { id: 100, name: 'Past Corp', category: 'corporation' },
    ])
  )
);

beforeEach(async () => {
  skillCalls = 0;
  await db.characters.clear();
  await db.tokens.clear();
  await db.settings.clear();
  await db.esiCache.clear();
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
  usePublicInfo.setState({ byCharacterId: {} });

  await db.characters.put({
    characterId: CHAR_ID,
    name: 'Pilot One',
    ownerHash: 'oh',
    addedAt: 1,
    corporationId: 200,
  });
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

/** The timeline's stint cards, most-recent first. */
const stints = () =>
  within(screen.getByRole('list', { name: 'Employment' })).getAllByRole('listitem');

describe('EmploymentHistory', () => {
  it("shows each stint's date range once: under the name for a phone, in the gutter from md up", async () => {
    render(<App />);
    await screen.findByRole('link', { name: 'Past Corp' });

    const past = stints()[1];
    // Two text nodes carry the start: the gutter's (md+) and the under-name range (below md).
    // Tailwind's `md:hidden` / `hidden md:block` show exactly one at any width.
    const underName = within(past).getByText(/Jan 2025 – Jan 2026/);
    expect(underName).toHaveClass('md:hidden');
    expect(within(past).getByText('Jan 2025', { selector: 'span' })).toHaveClass('block');
    expect(past.querySelector('.hidden.md\\:block')).not.toBeNull();
  });

  it('lists corporations most-recent first, with resolved names, without any granted scope', async () => {
    render(<App />);
    // 'Past Corp' rather than 'Current Corp': the shared header names the
    // character's *current* corporation too, and it resolves first.
    expect(await screen.findByRole('link', { name: 'Past Corp' })).toBeInTheDocument();
    const rows = stints();
    expect(rows[0]).toHaveTextContent('Current Corp');
    expect(rows[1]).toHaveTextContent('Past Corp');
    // Past Corp ran exactly 2025-01-01 to 2026-01-01: a full non-leap year.
    expect(rows[1]).toHaveTextContent('1y');
  });

  it('badges the ongoing row when it matches the character record', async () => {
    // A typical user has no grant on /corp and would just be rejected there,
    // so the ongoing row's name opens Show Info (like every row's), never /corp.
    render(<App />);

    await screen.findByRole('link', { name: 'Past Corp' });
    const rows = stints();
    expect(rows[0]).toHaveTextContent('Current Corp');
    expect(rows[0]).toHaveTextContent('Current');
    expect(within(rows[0]).getByRole('link', { name: 'Current Corp' })).toHaveAttribute(
      'href',
      expect.stringContaining('info=corporation-200')
    );
    // The past corp's row gets no badge either.
    expect(rows[1]).not.toHaveTextContent('Current');
  });

  it('does not badge the ongoing row when the character record has a different corp', async () => {
    // The character's own corp record resolves from ESI's public-info fetch
    // (CharacterHeader triggers it), which would otherwise resync back to
    // 200 — override the endpoint itself rather than the db row, so this
    // reflects a character whose current corp genuinely isn't the ongoing
    // history row's corp (e.g. corp record hasn't caught up to a corp move
    // reflected in the history yet).
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}`, () =>
        HttpResponse.json({
          name: 'Pilot One',
          corporation_id: 999,
          birthday: '2015-01-01T00:00:00Z',
          bloodline_id: 1,
          gender: 'female',
          race_id: 1,
        })
      ),
      http.get('https://esi.evetech.net/corporations/999', () =>
        HttpResponse.json({
          name: 'Other Corp',
          ticker: 'OC',
          ceo_id: 1,
          creator_id: 1,
          member_count: 5,
          tax_rate: 0.1,
        })
      )
    );
    render(<App />);

    await screen.findByRole('link', { name: 'Past Corp' });
    await screen.findByText('Other Corp');
    expect(screen.queryByText('Current')).toBeNull();
  });

  it('carries the same character header the Overview tab shows, without reaching for a scope', async () => {
    render(<App />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Pilot One' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Current Corp' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: 'Employment' })).toBeNull();

    // Data age sits on the tab row, not in the header; Refresh and export sit in
    // the header with the bell. The panel below has no title bar of its own: the tab says it.
    const header = screen.getByRole('heading', { level: 1, name: 'Pilot One' }).closest('header');
    expect(within(header!).getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
    expect(within(header!).getByRole('button', { name: 'Export Employment' })).toBeInTheDocument();
    const dataAge = await screen.findByText('Data updated');
    expect(header).not.toContainElement(dataAge);
    expect(screen.queryByRole('heading', { level: 2, name: 'Employment' })).toBeNull();

    // No SP at all, and nothing asked ESI for skills this character never granted.
    expect(screen.queryByText('Total SP')).toBeNull();
    expect(screen.queryByText('Unallocated SP')).toBeNull();
    expect(skillCalls).toBe(0);
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
    expect(await screen.findByText(/showing cached data/i)).toBeInTheDocument();
    // The first stint is the cached, ongoing/matching corp — its name may or
    // may not have resolved yet.
    expect(stints()[0]).toHaveTextContent(/#200|Current Corp/);
  });

  it("renders the previous visit's rows immediately, with no spinner, while it re-reads", async () => {
    // The retained snapshot `useRouteSnapshot`'s `cacheKey` writes on a
    // successful load. Seeded directly here because it only exists on a
    // *second* mount, and the global `resetRouteSnapshots` in `vitest.setup.ts`
    // rightly empties it before every test.
    writeRouteSnapshot('employment-history', CHAR_ID, {
      historyResult: {
        data: history,
        fetchedAt: new Date(STALE_FETCHED_AT),
        fromCache: false,
        truncated: false,
      },
      corpNames: new Map([
        [200, 'Current Corp'],
        [100, 'Past Corp'],
      ]),
      sp: { totalSp: null, unallocatedSp: null },
      loadedAt: Date.parse('2026-06-01T00:00:00Z'),
    });
    // Held open for the duration of the assertions, so anything on screen can
    // only be the retained snapshot. Released before the test ends rather than
    // left hanging: `esi/cache.ts` keys an in-flight read in `inFlightLoads`,
    // and a promise that never settles would still be there for the next test
    // to dedupe onto.
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/corporationhistory`, async () => {
        await held;
        return HttpResponse.json(history);
      })
    );

    render(<App />);

    expect(await screen.findByRole('link', { name: 'Past Corp' })).toBeInTheDocument();
    // The whole point: a load really is in flight, and no spinner is shown.
    expect(screen.queryByRole('status', { name: 'Loading' })).toBeNull();
    // Refresh still reports the in-flight load honestly.
    expect(screen.getByRole('button', { name: 'Refresh' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );

    release();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Refresh' })).not.toHaveAttribute('aria-disabled')
    );
  });

  it('shows the empty state when there is no data at all', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/corporationhistory`, () =>
        HttpResponse.error()
      )
    );
    render(<App />);
    expect(await screen.findByText(/no employment history cached/i)).toBeInTheDocument();
    // The panel's toolbar outlives its rows, so there is still a way back.
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
  });
});

describe('Employment History corporation names (issue #729)', () => {
  it('links every name to the corporation Show Info, with no ⋮ or row menu', async () => {
    render(<App />);
    const row = (await screen.findByRole('link', { name: 'Past Corp' })).closest('li');
    if (!row) throw new Error('expected a Past Corp stint');

    expect(within(row).getByRole('link', { name: 'Past Corp' })).toHaveAttribute(
      'href',
      expect.stringContaining('info=corporation-100')
    );
    expect(within(row).queryByRole('button', { name: /More actions/ })).not.toBeInTheDocument();
    fireEvent.contextMenu(row);
    expect(screen.queryByRole('menuitem', { name: 'Show info' })).not.toBeInTheDocument();
  });

  it('falls back to #id as the link text when the row has no resolved name', async () => {
    server.use(
      http.post('https://esi.evetech.net/universe/names', () =>
        HttpResponse.json([{ id: 200, name: 'Current Corp', category: 'corporation' }])
      )
    );
    render(<App />);

    expect(await screen.findByRole('link', { name: '#100' })).toHaveAttribute(
      'href',
      expect.stringContaining('info=corporation-100')
    );
  });
});
