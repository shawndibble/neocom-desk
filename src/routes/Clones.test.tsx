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
const ESI = 'https://esi.evetech.net';

const clonesPayload = {
  jump_clones: [
    {
      jump_clone_id: 1,
      location_id: 60003760,
      location_type: 'station' as const,
      implants: [19540],
    },
    {
      jump_clone_id: 2,
      location_id: 1000000000002,
      location_type: 'structure' as const,
      implants: [],
    },
  ],
  // Just jumped: with Infomorph Synchronizing III (21h cooldown), always on cooldown.
  last_clone_jump_date: new Date().toISOString(),
};

const skillsPayload = {
  skills: [
    {
      skill_id: 33399,
      trained_skill_level: 3,
      active_skill_level: 3,
      skillpoints_in_skill: 135_765,
    },
  ],
  total_sp: 135_765,
  unallocated_sp: 0,
};

const server = setupServer(
  http.get(`${ESI}/characters/${CHAR_ID}/clones`, () => HttpResponse.json(clonesPayload)),
  http.get(`${ESI}/characters/${CHAR_ID}/skills`, () => HttpResponse.json(skillsPayload)),
  http.get(`${ESI}/universe/stations/60003760`, () =>
    HttpResponse.json({
      station_id: 60003760,
      name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant',
      type_id: 1531,
      system_id: 30000142,
    })
  ),
  http.get(`${ESI}/universe/structures/1000000000002`, () =>
    HttpResponse.json({ error: 'Forbidden' }, { status: 403 })
  ),
  http.get(`${ESI}/characters/${CHAR_ID}`, () =>
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
  http.get(`${ESI}/corporations/1001`, () =>
    HttpResponse.json({
      name: 'Test Corp',
      ticker: 'TC',
      ceo_id: 1,
      creator_id: 1,
      member_count: 5,
      tax_rate: 0.1,
    })
  ),
  http.get(`${ESI}/alliances/2001`, () =>
    HttpResponse.json({
      name: 'Test Alliance',
      ticker: 'TA',
      creator_corporation_id: 1,
      creator_id: 1,
      date_founded: '2016-01-01T00:00:00Z',
    })
  ),
  http.post(`${ESI}/universe/names`, () =>
    HttpResponse.json([
      { id: 19540, name: 'High-grade Ascendancy Alpha', category: 'inventory_type' },
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
    scopes: ['esi-clones.read_clones.v1', 'esi-skills.read_skills.v1'],
  });
  await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: CHAR_ID });
  window.history.pushState({}, '', '/clones');
});

describe('Clones', () => {
  it('lists jump clones with resolved location and implant names, and the cooldown', async () => {
    render(<App />);
    expect(
      await screen.findByText('Jita IV - Moon 4 - Caldari Navy Assembly Plant')
    ).toBeInTheDocument();
    expect(screen.getByText('High-grade Ascendancy Alpha')).toBeInTheDocument();
    expect(screen.getByText('No implants')).toBeInTheDocument();
    expect(screen.getByText(/On cooldown until/)).toBeInTheDocument();
  });

  it('renders a clone in an inaccessible structure as an id fallback, without a re-auth banner', async () => {
    render(<App />);
    await screen.findByText('Jita IV - Moon 4 - Caldari Navy Assembly Plant');
    expect(screen.getByText('Structure #1000000000002')).toBeInTheDocument();
    expect(screen.queryByText('Log in again to see your clones')).not.toBeInTheDocument();
  });

  it('shows the empty state when there are no clones', async () => {
    server.use(
      http.get(`${ESI}/characters/${CHAR_ID}/clones`, () => HttpResponse.json({ jump_clones: [] }))
    );
    render(<App />);
    expect(await screen.findByText('No jump clones cached')).toBeInTheDocument();
  });

  it('carries the same character header the Overview tab shows, not a page title', async () => {
    render(<App />);

    // Identity, corp/alliance and SP: identical to /overview, so nothing above
    // the tabs moves as you switch between them.
    expect(await screen.findByRole('heading', { level: 1, name: 'Pilot One' })).toBeInTheDocument();
    expect(await screen.findByText('Test Corp / Test Alliance')).toBeInTheDocument();
    expect(await screen.findByText('135,765')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: 'Clones' })).not.toBeInTheDocument();
    // Refresh is a per-view control and still belongs to the header.
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
  });

  it('shows a re-login prompt when the clones scope itself was revoked', async () => {
    server.use(
      http.get(`${ESI}/characters/${CHAR_ID}/clones`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      )
    );
    render(<App />);
    expect(await screen.findByText('Log in again to see your clones')).toBeInTheDocument();
  });
});
