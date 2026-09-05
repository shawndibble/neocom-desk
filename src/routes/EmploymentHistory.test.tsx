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

let skillCalls = 0;

const server = setupServer(
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

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());
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

describe('EmploymentHistory', () => {
  it('lists corporations most-recent first, with resolved names, without any granted scope', async () => {
    render(<App />);
    // 'Past Corp' rather than 'Current Corp': the shared header names the
    // character's *current* corporation too, and it resolves first.
    expect(await screen.findByText('Past Corp')).toBeInTheDocument();
    const rows = screen.getAllByRole('row');
    // Row 0 is the header; row 1 should be the most recent corp.
    expect(rows[1]).toHaveTextContent('Current Corp');
    expect(rows[2]).toHaveTextContent('Past Corp');
    // Past Corp ran exactly 2025-01-01 to 2026-01-01: a full non-leap year.
    expect(rows[2]).toHaveTextContent('365d');
  });

  it('badges the ongoing row when it matches the character record, without linking it', async () => {
    // A typical user has no grant on /corp and would just be rejected there,
    // so the ongoing row is a badge, never a link.
    render(<App />);

    await screen.findByText('Past Corp');
    // Row 0 is the header; row 1 is the ongoing/matching corp.
    const rows = screen.getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Current Corp');
    expect(rows[1]).toHaveTextContent('Current');
    expect(screen.queryByRole('link', { name: 'Current Corp' })).toBeNull();
    // The past corp's row gets no badge either.
    expect(rows[2]).not.toHaveTextContent('Current');
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

    await screen.findByText('Past Corp');
    await screen.findByText('Other Corp');
    expect(screen.queryByText('Current')).toBeNull();
  });

  it('carries the same character header the Overview tab shows, without reaching for a scope', async () => {
    render(<App />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Pilot One' })).toBeInTheDocument();
    expect(await screen.findByText('Current Corp', { selector: 'p' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: 'Employment' })).toBeNull();

    // Data age and Refresh belong to this tab's panel, below the tabs.
    const refresh = screen.getByRole('button', { name: 'Refresh' });
    const header = screen.getByRole('heading', { level: 1, name: 'Pilot One' }).closest('header');
    expect(header?.contains(refresh)).toBe(false);

    // The SP chips hold their place with "—" rather than the header changing
    // shape — and nothing asked ESI for skills this character never granted.
    for (const label of ['Total SP', 'Unallocated SP']) {
      expect(screen.getByText(label).parentElement).toHaveTextContent('—');
    }
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
    // Row 0 is the header; row 1 is the cached, ongoing/matching corp — its
    // name may or may not have resolved yet.
    const rows = screen.getAllByRole('row');
    expect(rows[1]).toHaveTextContent(/#200|Current Corp/);
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
