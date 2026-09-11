import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { db, type BuildPlanRecord } from '@/db';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { useAuthFailure } from '@/stores/authFailure';
import { App } from '@/app/App';
import { clearMarketPriceCache } from '@/market/prices';
import { clearCostIndexCache } from '@/features/industry/marketData';
import {
  SYNCED_BUILD_GROUPS_KEY,
  useBuildGroups,
  type BuildGroupsValue,
} from '@/features/industry/buildGroups';
import type { BlueprintMap, TypeMap } from '@/sde/types';

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}));

// Same small fixture the other Industry route tests use: Rifter (638) needs
// Tritanium/Pyerite/Mechanical Parts; 9841 builds Mechanical Parts.
const BLUEPRINTS: BlueprintMap = {
  '638': {
    name: 'Rifter Blueprint',
    time: 1200,
    materials: [
      { typeID: 34, quantity: 100 },
      { typeID: 35, quantity: 50 },
      { typeID: 9840, quantity: 10 },
    ],
    products: [{ typeID: 587, quantity: 1 }],
    skills: [],
    activity: 'manufacturing',
  },
  '9841': {
    name: 'Mechanical Parts Blueprint',
    time: 300,
    materials: [{ typeID: 34, quantity: 20 }],
    products: [{ typeID: 9840, quantity: 5 }],
    skills: [],
    activity: 'manufacturing',
  },
};
const TYPES: TypeMap = {
  '587': { name: 'Rifter', groupID: 25, volume: 27289 },
  '34': { name: 'Tritanium', groupID: 18, volume: 0.01 },
  '35': { name: 'Pyerite', groupID: 18, volume: 0.01 },
  '9840': { name: 'Mechanical Parts', groupID: 428, volume: 0.03 },
};

vi.mock('@/sde/loadSde', () => ({
  loadSkills: vi.fn(async () => []),
  loadTypes: vi.fn(async () => TYPES),
  loadBlueprints: vi.fn(async () => BLUEPRINTS),
  loadPi: vi.fn(async () => ({ schematics: {}, raw: [] })),
  // A stale group id redirects to `/industry`, which loads this
  // unconditionally for its Opportunities tab.
  loadMarketWideTrees: vi.fn(async () => ({})),
}));

const CHAR_ID = 91;
const emptySkillsPayload = { skills: [], total_sp: 0, unallocated_sp: 0 };

function fuzzworkHandler() {
  return http.get('https://market.fuzzwork.co.uk/aggregates/', ({ request }) => {
    const url = new URL(request.url);
    const types = url.searchParams.get('types')?.split(',') ?? [];
    const body: Record<string, unknown> = {};
    for (const t of types) {
      if (t === '34') body[t] = { sell: { min: '10', volume: '10', orderCount: '1' } };
      else if (t === '9840') body[t] = { sell: { min: '50', volume: '5', orderCount: '1' } };
      else if (t === '587') body[t] = { sell: { min: '100000', volume: '1', orderCount: '1' } };
      else body[t] = { sell: { orderCount: '0' } };
    }
    return HttpResponse.json(body);
  });
}

const server = setupServer(
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/skills`, () =>
    HttpResponse.json(emptySkillsPayload)
  ),
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/blueprints`, () => HttpResponse.json([])),
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/skillqueue`, () => HttpResponse.json([])),
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/industry/jobs`, () =>
    HttpResponse.json([])
  ),
  http.get('https://esi.evetech.net/markets/prices', () =>
    HttpResponse.json([
      { type_id: 34, adjusted_price: 8 },
      { type_id: 35, adjusted_price: 3 },
      { type_id: 9840, adjusted_price: 20 },
    ])
  ),
  http.get('https://esi.evetech.net/industry/systems', () =>
    HttpResponse.json([
      {
        solar_system_id: 30000142,
        cost_indices: [{ activity: 'manufacturing', cost_index: 0.05 }],
      },
    ])
  ),
  http.get('https://esi.evetech.net/universe/systems/:id', ({ params }) =>
    HttpResponse.json({ system_id: Number(params.id), name: 'Badivefi', security_status: 0.6587 })
  ),
  fuzzworkHandler()
);

function seedPlan(
  overrides: Partial<BuildPlanRecord> & { id: string; name: string }
): BuildPlanRecord {
  return {
    characterId: CHAR_ID,
    blueprintTypeID: 638,
    runs: 1,
    me: 0,
    te: 0,
    facility: 'npcStation',
    rigLevel: 'none',
    security: 'highsec',
    hubId: 'jita',
    updatedAt: 1,
    ...overrides,
  };
}

async function seedGroup(id: string, name: string) {
  const value: BuildGroupsValue = { [CHAR_ID]: [{ id, name, order: 0 }] };
  await db.settings.put({ key: SYNCED_BUILD_GROUPS_KEY, value });
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());

afterEach(() => {
  server.resetHandlers();
  clearMarketPriceCache();
  clearCostIndexCache();
});
beforeEach(async () => {
  await db.characters.clear();
  await db.tokens.clear();
  await db.settings.clear();
  await db.skillPlans.clear();
  await db.esiCache.clear();
  await db.buildPlans.clear();
  await db.quickbars.clear();
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
  // Module-scope store, so a group seeded by one test outlives it in memory
  // unless it is put back — the same reset `Industry.test.tsx` used to do
  // for `useLastOpenedPlan`.
  useBuildGroups.setState({ value: {}, hydrated: false });
  usePublicInfo.setState({ byCharacterId: {} });
  useAuthFailure.setState({ failure: null });

  await db.characters.put({ characterId: CHAR_ID, name: 'Pilot One', ownerHash: 'oh', addedAt: 1 });
  await db.tokens.put({
    characterId: CHAR_ID,
    accessToken: 'access-token',
    refreshToken: 'refresh',
    expiresAt: Date.now() + 3_600_000,
    scopes: ['esi-skills.read_skillqueue.v1'],
  });
  await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: CHAR_ID });

  window.history.pushState({}, '', '/industry/groups/g1');
});

describe('IndustryGroupPage', () => {
  it("opens the group's rollup, listing its members", async () => {
    await seedGroup('g1', 'Rifter fit');
    await db.buildPlans.add(seedPlan({ id: 'bp-1', name: 'Rifter run', buildGroupId: 'g1' }));
    await db.buildPlans.add(
      seedPlan({
        id: 'bp-2',
        name: 'Parts run',
        blueprintTypeID: 9841,
        buildGroupId: 'g1',
        updatedAt: 2,
      })
    );
    render(<App />);

    expect(await screen.findByText('Rifter fit')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Rifter run/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Parts run/ })).toBeInTheDocument();
  });

  it("opening a member navigates to that plan's own page", async () => {
    const user = userEvent.setup();
    await seedGroup('g1', 'Rifter fit');
    await db.buildPlans.add(seedPlan({ id: 'bp-1', name: 'Rifter run', buildGroupId: 'g1' }));
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /Rifter run/ }));

    await waitFor(() => expect(window.location.pathname).toBe('/industry/plans/bp-1'));
    expect(await screen.findByRole('heading', { name: 'Rifter' })).toBeInTheDocument();
  });

  it('sends the pilot back to the index for a group id that does not exist', async () => {
    render(<App />);
    await waitFor(() => expect(window.location.pathname).toBe('/industry'));
  });

  it("sends the pilot back to the index for another character's group", async () => {
    await db.characters.put({ characterId: 92, name: 'Pilot Two', ownerHash: 'oh2', addedAt: 2 });
    const value: BuildGroupsValue = { 92: [{ id: 'g1', name: "Someone else's group", order: 0 }] };
    await db.settings.put({ key: SYNCED_BUILD_GROUPS_KEY, value });
    render(<App />);
    await waitFor(() => expect(window.location.pathname).toBe('/industry'));
  });
});
