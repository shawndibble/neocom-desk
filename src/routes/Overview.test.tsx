import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { db } from '@/db';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { App } from '@/app/App';
import { selectActiveQueueEntry } from './overviewQueue';
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

const queuePayload = [
  {
    skill_id: 3300,
    queue_position: 0,
    finished_level: 5,
    start_date: '2026-08-01T00:00:00Z',
    finish_date: '2026-09-01T00:00:00Z',
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
  )
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

  it('falls back gracefully when the wallet fetch fails offline', async () => {
    server.use(
      http.get('https://esi.evetech.net/characters/:id/wallet', () => HttpResponse.error())
    );
    render(<App />);
    expect(await screen.findByText(/no wallet data cached/i)).toBeInTheDocument();
  });

  it('redirects to /characters when no active character is set', async () => {
    await db.settings.clear();
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Characters' })).toBeInTheDocument();
  });
});

describe('selectActiveQueueEntry (BUG #10)', () => {
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
    expect(selectActiveQueueEntry(entries, NOW)?.skill_id).toBe(2);
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
    expect(selectActiveQueueEntry(entries, NOW)?.skill_id).toBe(2);
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
    expect(selectActiveQueueEntry(entries, NOW)?.skill_id).toBe(1);
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
    expect(selectActiveQueueEntry(entries, NOW)?.skill_id).toBe(2);
  });

  it('returns null for an empty queue', () => {
    expect(selectActiveQueueEntry([], NOW)).toBeNull();
  });
});
