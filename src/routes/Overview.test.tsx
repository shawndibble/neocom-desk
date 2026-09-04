import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { db } from '@/db';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { App } from '@/app/App';
import { selectActiveEntryFromSorted, sortQueueEntries, selectQueueDepth } from './overviewQueue';
import type { SkillType } from '@/sde/types';

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}));

const FIXTURE_SKILLS: SkillType[] = [
  {
    typeID: 3300,
    name: 'Gunnery',
    description: '',
    groupID: 10,
    groupName: 'Gunnery',
    rank: 1,
    primaryAttr: 'perception',
    secondaryAttr: 'willpower',
    prereqs: [],
  },
];

vi.mock('@/sde/loadSde', () => ({
  loadSkills: vi.fn(async () => FIXTURE_SKILLS),
  loadTypes: vi.fn(async () => ({})),
  loadBlueprints: vi.fn(async () => ({})),
}));

const CHAR_ID = 91;
let lastAuthHeader: string | null = null;

const skillsPayload = {
  skills: [
    { skill_id: 3300, trained_skill_level: 4, active_skill_level: 4, skillpoints_in_skill: 90000 },
  ],
  total_sp: 5_000_000,
  unallocated_sp: 12_000,
};

// Relative to the instant the suite runs, not a fixed pair of calendar dates:
// Overview.tsx feeds this into selectActiveEntryFromSorted(..., Date.now()), so a
// hardcoded past/future pair eventually falls out of that window and this
// entry silently stops being "active" — see the BUG #10 postmortem below for
// why that failure mode is exactly the one this file is guarding against.
const queuePayload = [
  {
    skill_id: 3300,
    queue_position: 0,
    finished_level: 5,
    start_date: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    finish_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

const server = setupServer(
  http.get('https://esi.evetech.net/characters/:id/wallet', ({ request }) => {
    lastAuthHeader = request.headers.get('authorization');
    return HttpResponse.json(1234567.89);
  }),
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/skills`, () =>
    HttpResponse.json(skillsPayload)
  ),
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/skillqueue`, () =>
    HttpResponse.json(queuePayload)
  ),
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}`, () =>
    HttpResponse.json({
      name: 'Pilot One',
      corporation_id: 1001,
      alliance_id: 2001,
      birthday: '2015-01-01T00:00:00Z',
      bloodline_id: 1,
      gender: 'female',
      race_id: 1,
    })
  ),
  http.get('https://esi.evetech.net/corporations/1001', () =>
    HttpResponse.json({
      name: 'Test Corp',
      ticker: 'TC',
      ceo_id: 1,
      creator_id: 1,
      member_count: 5,
      tax_rate: 0.1,
    })
  ),
  http.get('https://esi.evetech.net/alliances/2001', () =>
    HttpResponse.json({
      name: 'Test Alliance',
      ticker: 'TA',
      creator_corporation_id: 1,
      creator_id: 1,
      date_founded: '2016-01-01T00:00:00Z',
    })
  ),
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/industry/jobs`, () =>
    HttpResponse.json([])
  ),
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/contracts`, () => HttpResponse.json([]))
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());
beforeEach(async () => {
  lastAuthHeader = null;
  await db.characters.clear();
  await db.tokens.clear();
  await db.settings.clear();
  await db.esiCache.clear();
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
  usePublicInfo.setState({ byCharacterId: {} });

  await db.characters.put({ characterId: CHAR_ID, name: 'Pilot One', ownerHash: 'oh', addedAt: 1 });
  await db.tokens.put({
    characterId: CHAR_ID,
    accessToken: 'access-token-91',
    refreshToken: 'refresh-91',
    expiresAt: Date.now() + 3_600_000,
    scopes: ['esi-wallet.read_character_wallet.v1'],
  });
  await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: CHAR_ID });
  window.history.pushState({}, '', '/overview');
});

describe('Overview', () => {
  it('shows the active character name and wallet balance with data age', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Pilot One' })).toBeInTheDocument();
    expect(await screen.findByText(/1,234,567\.89/)).toBeInTheDocument();
    expect(screen.getAllByText('just now').length).toBeGreaterThan(0);
    expect(lastAuthHeader).toBe('Bearer access-token-91');
  });

  it('shows corp/alliance, total/unallocated SP, and the active training skill', async () => {
    render(<App />);
    expect(await screen.findByText(/Training Gunnery/)).toBeInTheDocument();
    expect(await screen.findByText(/Test Corp/)).toBeInTheDocument();
    expect(screen.getByText(/Test Alliance/)).toBeInTheDocument();
    expect(screen.getByText('5,000,000')).toBeInTheDocument();
    expect(screen.getByText('12,000')).toBeInTheDocument();
  });

  it('adds SP the queue finished to the total, which /skills has not counted', async () => {
    // ESI's total_sp comes from the same payload as the per-skill rows and
    // goes stale with them until the character next logs in.
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/skillqueue`, () =>
        HttpResponse.json([
          {
            skill_id: 3300,
            queue_position: 0,
            finished_level: 5,
            start_date: '2026-07-01T00:00:00Z',
            finish_date: '2026-07-20T00:00:00Z',
            level_end_sp: 512_000,
          },
        ])
      )
    );
    render(<App />);

    expect(await screen.findByText('5,422,000')).toBeInTheDocument(); // + (512,000 - 90,000)
    expect(screen.queryByText('5,000,000')).not.toBeInTheDocument();
  });

  it('keeps the block above the tabs to identity and SP alone', async () => {
    render(<App />);
    await screen.findByText(/1,234,567\.89/);

    // No page title restating the tab, and no controls: the wallet and queue
    // panels below carry their own data age. The name comes from a Dexie
    // useLiveQuery independent of the wallet balance just awaited above, so
    // this must wait for it too rather than assume it's already resolved —
    // same lesson Settings.test.tsx documents for its own character-name read.
    const header = (await screen.findByRole('heading', { level: 1, name: 'Pilot One' })).closest(
      'header'
    );
    expect(header).not.toBeNull();
    expect(within(header as HTMLElement).queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryByRole('heading', { level: 1, name: 'Overview' })).toBeNull();
  });

  it('falls back gracefully when the wallet fetch fails offline', async () => {
    server.use(
      http.get('https://esi.evetech.net/characters/:id/wallet', () => HttpResponse.error())
    );
    render(<App />);
    expect(await screen.findByText(/no wallet data cached/i)).toBeInTheDocument();
  });

  it('offers a re-login in the wallet panel when the wallet scope is gone', async () => {
    server.use(
      http.get(
        'https://esi.evetech.net/characters/:id/wallet',
        () => new HttpResponse(null, { status: 403 })
      )
    );
    render(<App />);
    // Overview spans three scopes, so only the wallet PANEL degrades — the rest
    // of the page must keep rendering rather than the whole route being gated.
    expect(await screen.findByText(/log in again to see your wallet/i)).toBeInTheDocument();
    expect(screen.queryByText(/no wallet data cached/i)).not.toBeInTheDocument();
  });

  it('does not offer a re-login when the wallet is merely unreachable', async () => {
    server.use(
      http.get('https://esi.evetech.net/characters/:id/wallet', () => HttpResponse.error())
    );
    render(<App />);
    expect(await screen.findByText(/no wallet data cached/i)).toBeInTheDocument();
    expect(screen.queryByText(/log in again to see your wallet/i)).not.toBeInTheDocument();
  });

  it('redirects to /characters when no active character is set', async () => {
    await db.settings.clear();
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Characters' })).toBeInTheDocument();
  });

  it('shows a re-login prompt in the queue panel when the skillqueue scope was revoked, without breaking the wallet/SP panels', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/skillqueue`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      )
    );
    render(<App />);
    expect(await screen.findByText('Log in again to see the training queue')).toBeInTheDocument();
    // Sibling panels still render from their own (healthy) data.
    expect(await screen.findByText(/1,234,567\.89/)).toBeInTheDocument();
    expect(screen.getByText('5,000,000')).toBeInTheDocument();
    expect(screen.queryByText(/no active in-game training queue cached/i)).not.toBeInTheDocument();
  });

  it('links the wallet balance to /wallet and the queue line to /skills/plans', async () => {
    render(<App />);
    const balanceLink = await screen.findByRole('link', { name: /1,234,567\.89/ });
    expect(balanceLink).toHaveAttribute('href', '/wallet');
    const queueLink = await screen.findByRole('link', { name: /Training Gunnery/ });
    expect(queueLink).toHaveAttribute('href', '/skills/plans');
  });

  it('shows queue depth (count, total remaining, final finish date) alongside the active entry', async () => {
    render(<App />);
    await screen.findByText(/Training Gunnery/);
    expect(screen.getByText(/1 queued/)).toBeInTheDocument();
  });

  it('wraps the training-queue panel in an aria-live region', async () => {
    render(<App />);
    await screen.findByText(/Training Gunnery/);
    const region = document.querySelector('[aria-live="polite"]');
    expect(region).not.toBeNull();
    expect(region?.textContent).toMatch(/Training Gunnery/);
  });

  it('offers a manual-refresh action on the wallet panel that re-fetches the balance', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    render(<App />);
    await screen.findByText(/1,234,567\.89/);

    server.use(
      http.get('https://esi.evetech.net/characters/:id/wallet', () => HttpResponse.json(42))
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Refresh wallet' }));

    expect(await screen.findByText(/42\.00/)).toBeInTheDocument();
  });

  it('shows the queue-empty state, not a false "scheduled" line, when the queue fetch fails with nothing cached', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/skillqueue`, () =>
        HttpResponse.error()
      )
    );
    render(<App />);
    expect(await screen.findByText(/no active in-game training queue cached/i)).toBeInTheDocument();
    expect(screen.queryByText(/skill queue scheduled/i)).not.toBeInTheDocument();
  });

  it('distinguishes a revoked scope from "no data yet" on the industry/contracts tiles', async () => {
    server.use(
      http.get(
        `https://esi.evetech.net/characters/${CHAR_ID}/industry/jobs`,
        () => new HttpResponse(null, { status: 403 })
      )
    );
    render(<App />);
    await screen.findByText(/1,234,567\.89/);
    const main = within(document.querySelector('main') as HTMLElement);
    const industryLink = await main.findByRole('link', {
      name: /industry: log in again to see this data/i,
    });
    expect(within(industryLink).getByText('—')).toBeInTheDocument();
  });

  it('shows "queue paused" copy when entries exist but none carry start/finish dates', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/skillqueue`, () =>
        HttpResponse.json([{ skill_id: 3300, queue_position: 0, finished_level: 5 }])
      )
    );
    render(<App />);
    expect(await screen.findByText(/paused/i)).toBeInTheDocument();
    expect(screen.queryByText(/no active in-game training queue cached/i)).not.toBeInTheDocument();
  });

  it('shows "queue empty" copy for a genuinely empty queue', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/skillqueue`, () =>
        HttpResponse.json([])
      )
    );
    render(<App />);
    expect(await screen.findByText(/no active in-game training queue cached/i)).toBeInTheDocument();
  });

  it('degrades only the skills/queue panel on a generic (non-reauth) fetch error, leaving the wallet panel healthy', async () => {
    const { loadSkills } = await import('@/sde/loadSde');
    vi.mocked(loadSkills).mockRejectedValueOnce(new Error('SDE fetch failed'));
    render(<App />);
    expect(await screen.findByText(/1,234,567\.89/)).toBeInTheDocument();
    expect(await screen.findByText('Could not load')).toBeInTheDocument();
  });

  it('shows industry/market/contracts summary tiles with counts and links', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/industry/jobs`, () =>
        HttpResponse.json([
          {
            job_id: 1,
            activity_id: 1,
            blueprint_type_id: 1,
            facility_id: 1,
            station_id: 1,
            runs: 1,
            start_date: '2026-08-01T00:00:00Z',
            end_date: '2026-09-01T00:00:00Z',
            status: 'active',
          },
        ])
      ),
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/contracts`, () =>
        HttpResponse.json([
          {
            contract_id: 1,
            issuer_id: 1,
            issuer_corporation_id: 1,
            assignee_id: 1,
            acceptor_id: 1,
            type: 'item_exchange',
            status: 'outstanding',
            for_corporation: false,
            availability: 'personal',
            date_issued: '2026-08-01T00:00:00Z',
            date_expired: '2026-09-01T00:00:00Z',
          },
          {
            contract_id: 2,
            issuer_id: 1,
            issuer_corporation_id: 1,
            assignee_id: 1,
            acceptor_id: 1,
            type: 'item_exchange',
            status: 'finished',
            for_corporation: false,
            availability: 'personal',
            date_issued: '2026-07-01T00:00:00Z',
            date_expired: '2026-08-01T00:00:00Z',
          },
        ])
      )
    );
    render(<App />);
    await screen.findByText(/1,234,567\.89/);
    const main = within(document.querySelector('main') as HTMLElement);

    const industryLink = main.getByRole('link', { name: /industry/i });
    expect(industryLink).toHaveAttribute('href', '/industry');
    expect(await within(industryLink).findByText('1')).toBeInTheDocument();

    const contractsLink = main.getByRole('link', { name: /contracts/i });
    expect(contractsLink).toHaveAttribute('href', '/contracts');
    expect(await within(contractsLink).findByText('1')).toBeInTheDocument(); // only the outstanding one

    const marketLink = main.getByRole('link', { name: /market/i });
    expect(marketLink).toHaveAttribute('href', '/market');
  });
});

describe('selectActiveEntryFromSorted (BUG #10)', () => {
  const NOW = Date.parse('2026-08-29T12:00:00Z');

  it('picks the entry whose window spans now, not just the first with a finish_date', () => {
    const entries = [
      // finish_date is set but this one already finished — must not win just
      // because Array#find would hit it first in insertion order.
      {
        skill_id: 1,
        queue_position: 0,
        finished_level: 1,
        start_date: '2026-08-01T00:00:00Z',
        finish_date: '2026-08-10T00:00:00Z',
      },
      {
        skill_id: 2,
        queue_position: 1,
        finished_level: 2,
        start_date: '2026-08-10T00:00:00Z',
        finish_date: '2026-09-01T00:00:00Z',
      },
    ];
    expect(selectActiveEntryFromSorted(sortQueueEntries(entries), NOW)?.skill_id).toBe(2);
  });

  it('is resilient to entries arriving out of queue_position order', () => {
    const entries = [
      {
        skill_id: 2,
        queue_position: 1,
        finished_level: 2,
        start_date: '2026-08-10T00:00:00Z',
        finish_date: '2026-09-01T00:00:00Z',
      },
      {
        skill_id: 1,
        queue_position: 0,
        finished_level: 1,
        start_date: '2026-08-01T00:00:00Z',
        finish_date: '2026-08-10T00:00:00Z',
      },
    ];
    expect(selectActiveEntryFromSorted(sortQueueEntries(entries), NOW)?.skill_id).toBe(2);
  });

  it('falls back to the first future entry when none currently spans now', () => {
    const entries = [
      {
        skill_id: 1,
        queue_position: 0,
        finished_level: 1,
        start_date: '2026-09-01T00:00:00Z',
        finish_date: '2026-09-10T00:00:00Z',
      },
    ];
    expect(selectActiveEntryFromSorted(sortQueueEntries(entries), NOW)?.skill_id).toBe(1);
  });

  it('skips paused entries with no start/finish date', () => {
    const entries = [
      { skill_id: 1, queue_position: 0, finished_level: 1 },
      {
        skill_id: 2,
        queue_position: 1,
        finished_level: 2,
        start_date: '2026-08-10T00:00:00Z',
        finish_date: '2026-09-01T00:00:00Z',
      },
    ];
    expect(selectActiveEntryFromSorted(sortQueueEntries(entries), NOW)?.skill_id).toBe(2);
  });

  it('returns null for an empty queue', () => {
    expect(selectActiveEntryFromSorted([], NOW)).toBeNull();
  });
});

describe('sortQueueEntries', () => {
  it('orders entries by queue_position, leaving the input untouched', () => {
    const entries = [
      { skill_id: 2, queue_position: 1, finished_level: 2 },
      { skill_id: 1, queue_position: 0, finished_level: 1 },
    ];
    const sorted = sortQueueEntries(entries);
    expect(sorted.map((e) => e.skill_id)).toEqual([1, 2]);
    expect(entries.map((e) => e.skill_id)).toEqual([2, 1]);
  });
});

describe('selectQueueDepth', () => {
  const NOW = Date.parse('2026-08-29T12:00:00Z');

  it('reports empty for no entries at all', () => {
    expect(selectQueueDepth([], NOW)).toEqual({
      status: 'empty',
      count: 0,
      totalRemainingSeconds: 0,
      finalFinishDate: null,
    });
  });

  it('reports paused when entries exist but none carry start/finish dates', () => {
    const entries = [
      { skill_id: 1, queue_position: 0, finished_level: 1 },
      { skill_id: 2, queue_position: 1, finished_level: 2 },
    ];
    expect(selectQueueDepth(entries, NOW)).toEqual({
      status: 'paused',
      count: 2,
      totalRemainingSeconds: 0,
      finalFinishDate: null,
    });
  });

  it('counts entries and sums remaining time to the last entry finish date', () => {
    const entries = [
      {
        skill_id: 1,
        queue_position: 0,
        finished_level: 1,
        start_date: '2026-08-29T12:00:00Z',
        finish_date: '2026-08-30T12:00:00Z', // +1d
      },
      {
        skill_id: 2,
        queue_position: 1,
        finished_level: 2,
        start_date: '2026-08-30T12:00:00Z',
        finish_date: '2026-09-02T12:00:00Z', // +4d total from NOW
      },
    ];
    const depth = selectQueueDepth(entries, NOW);
    expect(depth.status).toBe('training');
    expect(depth.count).toBe(2);
    expect(depth.totalRemainingSeconds).toBe(4 * 86_400);
    expect(depth.finalFinishDate).toBe('2026-09-02T12:00:00Z');
  });

  it('clamps remaining time at zero for a final finish already in the past', () => {
    const entries = [
      {
        skill_id: 1,
        queue_position: 0,
        finished_level: 1,
        start_date: '2026-08-01T00:00:00Z',
        finish_date: '2026-08-10T00:00:00Z',
      },
    ];
    expect(selectQueueDepth(entries, NOW).totalRemainingSeconds).toBe(0);
  });
});
