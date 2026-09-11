import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
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
import { useBuildGroups } from '@/features/industry/buildGroups';
import { DEFAULT_TRADE_HUB } from '@/market/hubs';
import type { BlueprintMap, TypeMap } from '@/sde/types';

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}));

// Small hand-made fixture, not the real SDE: one blueprint (Rifter, typeID
// 638) with two priced materials (Tritanium, Mechanical Parts) and a
// material with no hub orders (Pyerite). `9841` manufactures one of the
// Rifter's own materials, so a `?product=`/`?material=` deep link has
// somewhere real to resolve to besides the Rifter itself.
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
      {
        solar_system_id: 30002187,
        cost_indices: [{ activity: 'manufacturing', cost_index: 0.002 }],
      },
    ])
  ),
  http.get('https://esi.evetech.net/universe/systems/:id', ({ params }) => {
    const id = Number(params.id);
    return HttpResponse.json(
      id === 30002813
        ? { system_id: id, name: 'Tama', security_status: 0.2825 }
        : { system_id: id, name: 'Badivefi', security_status: 0.6587 }
    );
  }),
  fuzzworkHandler()
);

function seedPlan(overrides: Partial<BuildPlanRecord> = {}): BuildPlanRecord {
  return {
    id: 'bp-1',
    characterId: CHAR_ID,
    name: 'Rifter run',
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
  // Module-scope store, so it outlives a test unless it is put back — same
  // reason `useLastOpenedPlan` used to need this.
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

  window.history.pushState({}, '', '/industry');
});

describe('Industry: Build Plan CRUD', () => {
  it('creates via blueprint search (by product name), renames, duplicates, and deletes, persisted in Dexie', async () => {
    const user = userEvent.setup();
    render(<App />);

    const search = await screen.findByRole('searchbox', { name: 'Add build plan' });
    await user.type(search, 'Rift');
    await user.click(await screen.findByRole('button', { name: /Rifter/ }));

    expect(await screen.findByRole('button', { name: 'Rifter' })).toBeInTheDocument();
    const stored = await db.buildPlans.where('characterId').equals(CHAR_ID).toArray();
    expect(stored).toHaveLength(1);
    expect(stored[0].blueprintTypeID).toBe(638);
    expect(stored[0].name).toBe('Rifter');
    // No prior plan to default from: falls back to the historical hardcoded defaults (#456).
    expect(stored[0].facility).toBe('npcStation');
    expect(stored[0].rigFit).toEqual(['none', 'none', 'none']);
    expect(stored[0].security).toBe('highsec');
    expect(stored[0].hubId).toBe(DEFAULT_TRADE_HUB.id);
    expect(stored[0].facilityTaxPct).toBeUndefined();
    // Creating stays on the index — a search-and-add is a list-management
    // action, not "go start editing this" (that's what clicking the row, or
    // a `?product=` deep link, is for).
    expect(window.location.pathname).toBe('/industry');

    // Rename/duplicate/move-to-group live behind the row's context menu now
    // (#767) — only Delete stays a visible button.
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Rifter' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Rename' }));
    const renameInput = screen.getByRole('textbox', { name: 'Rename' });
    await user.clear(renameInput);
    await user.type(renameInput, 'Rifter run{Enter}');
    expect(await screen.findByRole('button', { name: 'Rifter run' })).toBeInTheDocument();

    const row = screen.getByRole('button', { name: 'Rifter run' }).closest('li')!;
    // The row action names the plan for a screen reader, but the bubble a
    // pointer user sees is the bare verb — they can already see the row.
    fireEvent.pointerMove(within(row).getByRole('button', { name: 'Delete Rifter run' }));
    expect(await screen.findByRole('tooltip')).toHaveTextContent(/^Delete$/);

    fireEvent.contextMenu(within(row).getByRole('button', { name: 'Rifter run' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Duplicate' }));
    expect(await screen.findByRole('button', { name: 'Rifter run (copy)' })).toBeInTheDocument();
    expect(await db.buildPlans.where('characterId').equals(CHAR_ID).count()).toBe(2);
    // Duplicate also stays on the index, same reasoning as create.
    expect(window.location.pathname).toBe('/industry');

    const originalRow = screen.getByRole('button', { name: 'Rifter run' }).closest('li')!;
    await user.click(within(originalRow).getByRole('button', { name: 'Delete Rifter run' }));
    // handleDelete is fire-and-forget from the click handler (Industry.tsx),
    // so wait for the live-query-driven UI to drop the row before reading
    // Dexie directly — otherwise the read can race the still-in-flight
    // delete (tombstone write included) and see two rows instead of one.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Rifter run' })).not.toBeInTheDocument()
    );
    const remaining = await db.buildPlans.where('characterId').equals(CHAR_ID).toArray();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].name).toBe('Rifter run (copy)');
  });

  it('defaults facility/rig/security/hub/tax/build system/build location on a new plan from the most-recently-updated existing plan (#456)', async () => {
    // Older plan first: its (wrong) settings must lose to the newer one below,
    // proving the defaulting picks the most-recently-updated plan, not just
    // "some" existing plan.
    await db.buildPlans.add(
      seedPlan({
        id: 'bp-old',
        name: 'Old run',
        blueprintTypeID: 9841,
        facility: 'azbel',
        rigLevel: 't1',
        security: 'nullsec',
        hubId: 'rens',
        facilityTaxPct: 0.1,
        buildSystemId: 30002510,
        buildSystemName: 'Rens',
        buildLocationId: 60004588,
        buildLocationName: 'Rens VI - Moon 8 - Brutor Tribe Treasury',
        updatedAt: 3,
      })
    );
    await db.buildPlans.add(
      seedPlan({
        id: 'bp-parts',
        name: 'Parts run',
        blueprintTypeID: 9841,
        facility: 'raitaru',
        rigLevel: 't2',
        // Lowsec because it builds in Tama, not because anyone typed it — the
        // band follows the build system now, so the fixture has to name one.
        security: 'lowsec',
        buildSystemId: 30002813,
        buildSystemName: 'Tama',
        hubId: 'amarr',
        facilityTaxPct: 0.25,
        buildLocationId: 1035466617946,
        buildLocationName: 'Tama - Sosala Raitaru',
        updatedAt: 5,
      })
    );
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole('button', { name: 'Parts run' });
    const search = await screen.findByRole('searchbox', { name: 'Add build plan' });
    await user.type(search, 'Rift');
    await user.click(await screen.findByRole('button', { name: /Rifter/ }));

    await screen.findByRole('button', { name: 'Rifter' });
    const created = await db.buildPlans
      .where('characterId')
      .equals(CHAR_ID)
      .and((p) => p.blueprintTypeID === 638)
      .first();
    expect(created?.facility).toBe('raitaru');
    expect(created?.rigFit).toEqual(['meT2', 'teT2', 'none']);
    expect(created?.security).toBe('lowsec');
    expect(created?.hubId).toBe('amarr');
    expect(created?.facilityTaxPct).toBe(0.25);
    expect(created?.buildSystemId).toBe(30002813);
    expect(created?.buildSystemName).toBe('Tama');
    // The place the pilot actually named comes along with the fields it filled
    // (#527): a new plan whose facility/system/band all came from the Raitaru
    // in Tama must not show an empty location box.
    expect(created?.buildLocationId).toBe(1035466617946);
    expect(created?.buildLocationName).toBe('Tama - Sosala Raitaru');
  });
});

describe('Industry: "jump to a Build Plan" from the Market Browser (issue #6)', () => {
  it('creates a plan for a product typeID with no existing plan, opens it, then clears the query param', async () => {
    window.history.pushState({}, '', '/industry?product=587');
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Rifter' })).toBeInTheDocument();
    expect(await db.buildPlans.where('characterId').equals(CHAR_ID).count()).toBe(1);
    await waitFor(() => expect(window.location.pathname).toMatch(/^\/industry\/plans\//));
    expect(window.location.search).toBe('');
  });

  it('opens an existing plan for that blueprint rather than creating a duplicate', async () => {
    await db.buildPlans.add(seedPlan());
    window.history.pushState({}, '', '/industry?product=587');
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Rifter' })).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe('/industry/plans/bp-1'));
    expect(await db.buildPlans.where('characterId').equals(CHAR_ID).count()).toBe(1);
  });

  it('opens the matching plan even when it is not the first plan for the character', async () => {
    // A different (unrelated) plan seeded first, so "just open plans[0]" is
    // the wrong answer — this is what the naive version of this feature
    // looked like before the fix.
    await db.buildPlans.add(seedPlan({ id: 'bp-0', name: 'Other plan', blueprintTypeID: 9841 }));
    await db.buildPlans.add(seedPlan({ id: 'bp-1', name: 'Rifter run' }));
    window.history.pushState({}, '', '/industry?product=587');
    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe('/industry/plans/bp-1'));
    await waitFor(() => expect(window.location.search).toBe(''));
    expect(await screen.findByRole('heading', { name: 'Rifter' })).toBeInTheDocument();
  });
});

describe('Industry: a Build Plan seeded from a BPC listing (issue #637)', () => {
  const SEEDED = '/industry?product=587&me=10&te=20&runs=5';

  it("opens a plan at the listing's own ME, TE and runs, then clears the seed", async () => {
    window.history.pushState({}, '', SEEDED);
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Rifter' })).toBeInTheDocument();
    const created = await db.buildPlans.where('characterId').equals(CHAR_ID).first();
    // Named for the copy it quotes: a pilot can hold a plain plan and several
    // seeded plans for one blueprint, and rows all reading "Rifter" would be
    // unusable.
    expect(created?.name).toBe('Rifter 10/20 ×5');
    expect(created?.me).toBe(10);
    expect(created?.te).toBe(20);
    expect(created?.runs).toBe(5);
    await waitFor(() => expect(window.location.search).toBe(''));
  });

  it('beats an owned copy of the same blueprint at different research', async () => {
    // The pilot is judging a copy they might buy, not the one in the hangar.
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/blueprints`, () =>
        HttpResponse.json([
          {
            item_id: 1,
            type_id: 638,
            runs: -1,
            material_efficiency: 8,
            time_efficiency: 16,
            quantity: 1,
          },
        ])
      )
    );
    window.history.pushState({}, '', SEEDED);
    render(<App />);

    await screen.findByRole('heading', { name: 'Rifter' });
    await waitFor(() => expect(window.location.search).toBe(''));
    const created = await db.buildPlans.where('characterId').equals(CHAR_ID).first();
    expect(created?.me).toBe(10);
    expect(created?.te).toBe(20);
  });

  it('creates the seeded plan beside an existing plan at different research, not instead of it', async () => {
    await db.buildPlans.add(seedPlan());
    window.history.pushState({}, '', SEEDED);
    render(<App />);

    await screen.findByRole('heading', { name: 'Rifter' });
    await waitFor(() => expect(window.location.search).toBe(''));
    // The plain plan is untouched, and exactly one plan was added — the create
    // effect must settle rather than re-fire once the seeded plan exists.
    expect(await db.buildPlans.where('characterId').equals(CHAR_ID).count()).toBe(2);
    expect((await db.buildPlans.get('bp-1'))?.me).toBe(0);
  });

  it('reuses the plan the first click created when the same listing is opened again', async () => {
    await db.buildPlans.add(
      seedPlan({ id: 'bp-seeded', name: 'Rifter 10/20 ×5', me: 10, te: 20, runs: 5 })
    );
    window.history.pushState({}, '', SEEDED);
    render(<App />);

    await screen.findByRole('heading', { name: 'Rifter' });
    await waitFor(() => expect(window.location.pathname).toBe('/industry/plans/bp-seeded'));
    await waitFor(() => expect(window.location.search).toBe(''));
    expect(await db.buildPlans.where('characterId').equals(CHAR_ID).count()).toBe(1);
  });

  it('leaves the unseeded path alone when only some of the three numbers arrive', async () => {
    // A truncated or hand-edited URL is not a half-seeded intent: it falls all
    // the way back to the ordinary `?product=` behaviour.
    await db.buildPlans.add(seedPlan());
    window.history.pushState({}, '', '/industry?product=587&me=10');
    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe('/industry/plans/bp-1'));
    await waitFor(() => expect(window.location.search).toBe(''));
    expect(await db.buildPlans.where('characterId').equals(CHAR_ID).count()).toBe(1);
  });
});

describe('Industry: "View in Industry as material" from Assets (issue #414)', () => {
  it("opens the character's existing plan whose blueprint consumes the material, then clears the query param", async () => {
    await db.buildPlans.add(seedPlan());
    window.history.pushState({}, '', '/industry?material=34');
    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe('/industry/plans/bp-1'));
    await waitFor(() => expect(window.location.search).toBe(''));
    // Never creates a plan — only opens among the character's existing ones.
    expect(await db.buildPlans.where('characterId').equals(CHAR_ID).count()).toBe(1);
  });

  it('opens the correct plan when it is not the only one seeded', async () => {
    // Material 35 (Pyerite) is a Rifter-only input — 9841 (Mechanical Parts)
    // doesn't consume it, unlike Tritanium (34), which both blueprints share.
    await db.buildPlans.add(seedPlan({ id: 'bp-0', name: 'Other plan', blueprintTypeID: 9841 }));
    await db.buildPlans.add(seedPlan({ id: 'bp-1', name: 'Rifter run', blueprintTypeID: 638 }));
    window.history.pushState({}, '', '/industry?material=35');
    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe('/industry/plans/bp-1'));
    expect(await screen.findByRole('heading', { name: 'Rifter' })).toBeInTheDocument();
  });

  it('clears the query param without opening or creating anything when no plan consumes that material', async () => {
    await db.buildPlans.add(seedPlan({ blueprintTypeID: 9841 }));
    // 999: not a material of either fixture blueprint.
    window.history.pushState({}, '', '/industry?material=999');
    render(<App />);

    await screen.findByRole('button', { name: 'Rifter run' });
    await waitFor(() => expect(window.location.search).toBe(''));
    expect(window.location.pathname).toBe('/industry');
    expect(await db.buildPlans.where('characterId').equals(CHAR_ID).count()).toBe(1);
  });
});

describe('Industry: owned-blueprint reauth', () => {
  it('shows a re-login prompt when the blueprints scope was revoked, without blocking the rest of the page', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/blueprints`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      )
    );
    render(<App />);

    expect(await screen.findByText('Log in again to see owned blueprints')).toBeInTheDocument();
    // The Build Plan list and Active Jobs panel still render.
    expect(await screen.findByRole('searchbox', { name: 'Add build plan' })).toBeInTheDocument();
    expect(screen.getByText('Active jobs')).toBeInTheDocument();
  });
});
