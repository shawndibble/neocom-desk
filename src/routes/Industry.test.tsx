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
// material with no hub orders (Pyerite), to exercise the unpriced-material
// flag end to end. Three materials (not two) so materialCost/totalCost never
// coincide with a single line total in the rendered numbers.
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
  },
  // Manufactures one of the Rifter's own materials, so the materials table
  // has both a build-able row (Mechanical Parts) and rows nothing produces
  // (the two minerals) to tell the context menu's two Build Plan states apart.
  '9841': {
    name: 'Mechanical Parts Blueprint',
    time: 300,
    materials: [{ typeID: 34, quantity: 20 }],
    products: [{ typeID: 9840, quantity: 5 }],
    skills: [],
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

// The materials row menu's "Show info" opens ItemDetailModal, which resolves
// attribute ids through this dictionary. Mocked rather than fetched: the real
// loader reads a public/data file, and `onUnhandledRequest: 'error'` rejects it.
const STRUCTURE_HITPOINTS_ATTR_ID = 9;
vi.mock('@/sde/loadMarketSde', () => ({
  loadAttributeDictionary: vi.fn(async () => ({
    9: { name: 'Structure Hitpoints', unit: 'HP', category: 'Structure' },
  })),
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
      else body[t] = { sell: { orderCount: '0' } }; // Pyerite: no sell orders -> unpriceable
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

/**
 * Industry renders one column at a time below `lg`, so most of this file —
 * which is about the plan detail — needs a viewport wide enough for the
 * detail pane to exist at all. jsdom's stub never matches, i.e. it is a
 * narrow screen; `beforeEach` widens it and the narrow-screen tests opt back
 * out with `useNarrowViewport()`.
 */
const realMatchMedia = window.matchMedia;
function useViewport(matches: boolean) {
  window.matchMedia = (media: string) =>
    ({
      media,
      matches,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}
const useNarrowViewport = () => useViewport(false);

afterEach(() => {
  server.resetHandlers();
  clearMarketPriceCache();
  clearCostIndexCache();
  window.matchMedia = realMatchMedia;
});
beforeEach(async () => {
  useViewport(true);
  await db.characters.clear();
  await db.tokens.clear();
  await db.settings.clear();
  await db.skillPlans.clear();
  await db.esiCache.clear();
  await db.buildPlans.clear();
  await db.quickbars.clear();
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
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

    await user.click(await screen.findByRole('button', { name: 'New plan' }));
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
    expect(stored[0].rigLevel).toBe('none');
    expect(stored[0].security).toBe('highsec');
    expect(stored[0].hubId).toBe(DEFAULT_TRADE_HUB.id);
    expect(stored[0].facilityTaxPct).toBeUndefined();

    await user.click(screen.getByRole('button', { name: 'Rename Rifter' }));
    const renameInput = screen.getByRole('textbox', { name: 'Rename' });
    await user.clear(renameInput);
    await user.type(renameInput, 'Rifter run{Enter}');
    expect(await screen.findByRole('button', { name: 'Rifter run' })).toBeInTheDocument();

    const row = screen.getByRole('button', { name: 'Rifter run' }).closest('li')!;
    // The row action names the plan for a screen reader, but the bubble a
    // pointer user sees is the bare verb — they can already see the row.
    fireEvent.pointerMove(within(row).getByRole('button', { name: 'Delete Rifter run' }));
    expect(await screen.findByRole('tooltip')).toHaveTextContent(/^Delete$/);

    await user.click(within(row).getByRole('button', { name: 'Duplicate Rifter run' }));
    expect(await screen.findByRole('button', { name: 'Rifter run (copy)' })).toBeInTheDocument();
    expect(await db.buildPlans.where('characterId').equals(CHAR_ID).count()).toBe(2);

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

  it('defaults facility/rig/security/hub/tax on a new plan from the most-recently-updated existing plan (#456)', async () => {
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
        security: 'lowsec',
        hubId: 'amarr',
        facilityTaxPct: 0.25,
        updatedAt: 5,
      })
    );
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole('button', { name: 'Parts run' });
    await user.click(screen.getByRole('button', { name: 'New plan' }));
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
    expect(created?.rigLevel).toBe('t2');
    expect(created?.security).toBe('lowsec');
    expect(created?.hubId).toBe('amarr');
    expect(created?.facilityTaxPct).toBe(0.25);
  });
});

describe('Industry: "jump to a Build Plan" from the Market Browser (issue #6)', () => {
  it('creates and selects a plan for a product typeID with no existing plan, then clears the query param', async () => {
    window.history.pushState({}, '', '/industry?product=587');
    render(<App />);

    const row = await screen.findByRole('button', { name: 'Rifter' });
    expect(row.closest('li')).toHaveClass('bg-panel-2');
    expect(await db.buildPlans.where('characterId').equals(CHAR_ID).count()).toBe(1);
    // `vi.waitFor` polls without React's act() wrapping — the query-param
    // clear it's waiting on is a router/component state update, so an
    // unwrapped poll here is exactly what triggers "not wrapped in act(...)".
    // `@testing-library/react`'s `waitFor` wraps every retry.
    await waitFor(() => expect(window.location.search).toBe(''));
  });

  it('reuses an existing plan for that blueprint rather than creating a duplicate', async () => {
    await db.buildPlans.add(seedPlan());
    window.history.pushState({}, '', '/industry?product=587');
    render(<App />);

    const row = await screen.findByRole('button', { name: 'Rifter run' });
    await waitFor(() => expect(row.closest('li')).toHaveClass('bg-panel-2'));
    expect(await db.buildPlans.where('characterId').equals(CHAR_ID).count()).toBe(1);
  });

  it('selects the reused plan even when it is not the first plan in the list, and the selection survives the URL settling', async () => {
    // A different (unrelated) plan seeded first, so `plans[0]` is the wrong
    // answer — this is what the naive "fall back to plans[0] once the
    // ?product= param clears" bug looked like before the fix: it happened to
    // pass with a single seeded plan because plans[0] was coincidentally
    // correct.
    await db.buildPlans.add(seedPlan({ id: 'bp-0', name: 'Other plan', blueprintTypeID: 999 }));
    await db.buildPlans.add(seedPlan({ id: 'bp-1', name: 'Rifter run' }));
    window.history.pushState({}, '', '/industry?product=587');
    render(<App />);

    const row = await screen.findByRole('button', { name: 'Rifter run' });
    await waitFor(() => expect(row.closest('li')).toHaveClass('bg-panel-2'));
    await waitFor(() => expect(window.location.search).toBe(''));
    // The selection must still be the reused plan after the param clears, not plans[0].
    expect(row.closest('li')).toHaveClass('bg-panel-2');
    expect(screen.getByRole('button', { name: 'Other plan' }).closest('li')).not.toHaveClass(
      'bg-panel-2'
    );
  });
});

describe('Industry: owned-blueprint prefill', () => {
  it('prefills ME/TE from the best owned copy and shows the owned hint', async () => {
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
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'New plan' }));
    const search = await screen.findByRole('searchbox', { name: 'Add build plan' });
    await user.type(search, 'Rift');
    await user.click(await screen.findByRole('button', { name: /Rifter/ }));

    await screen.findByRole('button', { name: 'Rifter' });
    expect(screen.getByLabelText('ME %')).toHaveValue(8);
    expect(screen.getByLabelText('TE %')).toHaveValue(16);
    expect(screen.getByText('Owned, ME 8% / TE 16%')).toBeInTheDocument();

    const stored = await db.buildPlans.where('characterId').equals(CHAR_ID).first();
    expect(stored?.me).toBe(8);
    expect(stored?.te).toBe(16);
  });

  it('shows a re-login prompt when the blueprints scope was revoked, without blocking the rest of the page', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/blueprints`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      )
    );
    render(<App />);

    expect(await screen.findByText('Log in again to see owned blueprints')).toBeInTheDocument();
    // The Build Plan list and Active Jobs panel still render.
    expect(await screen.findByRole('button', { name: 'New plan' })).toBeInTheDocument();
    expect(screen.getByText('Active jobs')).toBeInTheDocument();
  });
});

describe('Industry: jargon tooltips (UX-REVIEW #8)', () => {
  it('gives ME, TE, and facility tax inputs an accessible tooltip without polluting their labels', async () => {
    const user = userEvent.setup();
    await db.buildPlans.add(seedPlan());
    render(<App />);

    await screen.findByRole('heading', { name: 'Rifter' });
    // Labels stay exact ("ME %"/"TE %") — the tooltip trigger lives outside the <label>.
    expect(screen.getByLabelText('ME %')).toBeInTheDocument();
    expect(screen.getByLabelText('TE %')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'About ME' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'About TE' })).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: 'About facility tax' })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Facility'), 'raitaru');
    expect(screen.getByLabelText('Facility tax %')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'About facility tax' })).toBeInTheDocument();
  });
});

describe('Industry: build plan settings grouping (#120)', () => {
  it('groups Runs/ME/TE under Blueprint and the rest under Location & market', async () => {
    await db.buildPlans.add(seedPlan());
    render(<App />);

    await screen.findByRole('heading', { name: 'Rifter' });
    expect(screen.getByText('Blueprint')).toBeInTheDocument();
    expect(screen.getByText('Location & market')).toBeInTheDocument();

    // All the original fields still render, just regrouped.
    expect(screen.getByLabelText('Runs')).toBeInTheDocument();
    expect(screen.getByLabelText('ME %')).toBeInTheDocument();
    expect(screen.getByLabelText('TE %')).toBeInTheDocument();
    expect(screen.getByLabelText('Facility')).toBeInTheDocument();
    expect(screen.getByLabelText('Rig')).toBeInTheDocument();
    expect(screen.getByLabelText('Security')).toBeInTheDocument();
    expect(screen.getByLabelText('Trade hub')).toBeInTheDocument();
  });
});

describe('Industry: /skills is stale until the character logs in', () => {
  it('applies an Industry level the queue finished in the past, which /skills omits', async () => {
    // Base blueprint time is 1200s (20m). Industry V is -4%/level, so a
    // credited level 5 lands at 960s (16m). ESI says past-finish_date queue
    // entries must be applied on top of /skills, which here reports nothing.
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/skillqueue`, () =>
        HttpResponse.json([
          {
            skill_id: 3380, // Industry
            queue_position: 0,
            finished_level: 5,
            start_date: '2026-01-01T00:00:00Z',
            finish_date: '2026-01-05T00:00:00Z',
          },
        ])
      )
    );
    await db.buildPlans.add(seedPlan());
    render(<App />);

    expect(await screen.findByText('16m')).toBeInTheDocument();
    expect(screen.queryByText('20m')).not.toBeInTheDocument();
  });

  it('does not credit a paused queue entry, which carries no finish date', async () => {
    // peterhaneve/evemon#40: an absent date is "ETA unknown", never "done".
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/skillqueue`, () =>
        HttpResponse.json([{ skill_id: 3380, queue_position: 0, finished_level: 5 }])
      )
    );
    await db.buildPlans.add(seedPlan());
    render(<App />);

    expect(await screen.findByText('20m')).toBeInTheDocument();
  });

  it('skips the queue read and shows no reauth notice when the character never granted the queue scope', async () => {
    await db.tokens.put({
      characterId: CHAR_ID,
      accessToken: 'access-token',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 3_600_000,
      scopes: [],
    });
    let queueRequests = 0;
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/skillqueue`, () => {
        queueRequests += 1;
        return HttpResponse.json([], { status: 403 });
      })
    );
    await db.buildPlans.add(seedPlan());
    render(<App />);

    // No queue correction applied: base blueprint time stands.
    expect(await screen.findByText('20m')).toBeInTheDocument();
    expect(queueRequests).toBe(0);
    expect(screen.queryByText('EVE access was refused')).not.toBeInTheDocument();
  });
});

describe('Industry: results panel', () => {
  it('keeps materials and time visible, but shows an empty state instead of cost/profit, when prices are unreachable (offline)', async () => {
    server.use(
      http.get('https://esi.evetech.net/markets/prices', () => HttpResponse.error()),
      http.get('https://esi.evetech.net/industry/systems', () => HttpResponse.error())
    );
    await db.buildPlans.add(seedPlan());
    render(<App />);

    expect(await screen.findByText('Tritanium')).toBeInTheDocument();
    expect(screen.getByText('Pyerite')).toBeInTheDocument();
    expect(screen.getByText('20m')).toBeInTheDocument(); // formatDuration(1200s)

    // findByText: the results panel now shows a distinct "fetching" state
    // (#409) until the (mocked-to-fail) price fetch settles.
    expect(await screen.findByText('Price data unavailable')).toBeInTheDocument();
    expect(screen.queryByText('Not enough price data for a build-vs-buy verdict.')).toBeNull();
  });
});

describe('Industry: side-by-side Build Plan list + detail layout (#159)', () => {
  it('shows one column at a time on narrow screens, with a back control that returns to the list', async () => {
    useNarrowViewport();
    const user = userEvent.setup();
    await db.buildPlans.add(seedPlan());
    render(<App />);

    const listPanel = (await screen.findByRole('button', { name: 'New plan' })).closest('section');
    expect(listPanel).not.toHaveClass('hidden');
    // The detail isn't merely hidden while collapsed away — it isn't mounted,
    // so it can't spend a narrow-screen visitor's bandwidth fetching prices
    // for a plan they never opened.
    expect(screen.queryByRole('heading', { name: 'Rifter' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back to build plans' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Rifter run' }));

    expect(listPanel).toHaveClass('hidden');
    expect(await screen.findByRole('heading', { name: 'Rifter' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Back to build plans' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back to build plans' }));

    expect(listPanel).not.toHaveClass('hidden');
    expect(screen.queryByRole('heading', { name: 'Rifter' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back to build plans' })).not.toBeInTheDocument();
  });

  it('does not mark a row selected on a narrow screen while no plan is open', async () => {
    useNarrowViewport();
    const user = userEvent.setup();
    await db.buildPlans.add(seedPlan());
    render(<App />);

    const row = await screen.findByRole('button', { name: 'Rifter run' });
    // The first-plan fallback drives the desktop detail pane; it must not
    // leave a row looking selected when nothing is on screen beside it.
    expect(row.closest('li')).not.toHaveClass('bg-panel-2');

    await user.click(row);
    expect(row.closest('li')).toHaveClass('bg-panel-2');
  });

  it('keeps both panes visible on desktop, with no back control', async () => {
    await db.buildPlans.add(seedPlan());
    render(<App />);

    const listPanel = (await screen.findByRole('button', { name: 'New plan' })).closest('section');
    const detailPane = (await screen.findByRole('heading', { name: 'Rifter' })).closest('article');
    expect(listPanel).not.toHaveClass('hidden');
    expect(detailPane).not.toHaveClass('hidden');
    expect(screen.queryByRole('button', { name: 'Back to build plans' })).not.toBeInTheDocument();

    // The two panes are columns of one grid, each with its own scroller: the
    // list's is the row list alone, so the heading and create button stay
    // put; the detail's is `lg:`-gated so a phone doesn't nest a
    // viewport-sized editor inside a scroll region, and is capped against
    // the live viewport height rather than a flat constant (#237-class fix).
    expect(listPanel?.parentElement).toHaveClass('lg:grid-cols-[20rem_1fr]', 'lg:items-start');
    expect(screen.getByRole('list')).toHaveClass('max-h-[28rem]', 'overflow-y-auto');
    expect(detailPane?.querySelector('div')).toHaveClass('lg:overflow-y-auto');
    expect(detailPane?.querySelector('div')?.className).not.toMatch(/\bmax-h-/);
  });
});
describe('Industry: materials row context menu', () => {
  /** Right-clicks a materials-table row by its item name and returns the row. */
  async function openMaterialMenu(name: string) {
    const row = (await screen.findByText(name)).closest('tr');
    if (!row) throw new Error(`expected a ${name} materials row`);
    row.focus();
    fireEvent.contextMenu(row);
    return row;
  }

  it('offers the shared item actions on a material row', async () => {
    await db.buildPlans.add(seedPlan());
    render(<App />);
    await openMaterialMenu('Mechanical Parts');

    expect(screen.getByRole('menuitem', { name: 'Add to Quickbar' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Show info' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Add to Compare' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'View in Market' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Copy name' })).toBeInTheDocument();
    // The catalog is already loaded on this page, so the label resolves
    // straight to its answer — never the lazy callers' "checking…" state.
    expect(screen.getByRole('menuitem', { name: 'Build Plan' })).toBeInTheDocument();
  });

  it('reads "No blueprint options" for a mineral nothing manufactures', async () => {
    await db.buildPlans.add(seedPlan());
    render(<App />);
    await openMaterialMenu('Tritanium');

    expect(screen.getByRole('menuitem', { name: 'No blueprint options' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(screen.queryByRole('menuitem', { name: 'Build Plan' })).not.toBeInTheDocument();
  });

  it('creates and selects a plan for a manufacturable material via Build Plan', async () => {
    const user = userEvent.setup();
    await db.buildPlans.add(seedPlan());
    render(<App />);
    await openMaterialMenu('Mechanical Parts');

    await user.click(screen.getByRole('menuitem', { name: 'Build Plan' }));

    // Same `?product=` round trip the Market Browser's menu takes, so the
    // material's own plan is created if missing and selected either way.
    const row = await screen.findByRole('button', { name: 'Mechanical Parts' });
    await waitFor(() => expect(row.closest('li')).toHaveClass('bg-panel-2'));
    const stored = await db.buildPlans.where('characterId').equals(CHAR_ID).toArray();
    expect(stored).toHaveLength(2);
    expect(stored.map((p) => p.blueprintTypeID)).toContain(9841);
    await waitFor(() => expect(window.location.search).toBe(''));
  });

  it('selects an existing plan for that material instead of duplicating it', async () => {
    const user = userEvent.setup();
    await db.buildPlans.add(seedPlan());
    await db.buildPlans.add(
      seedPlan({ id: 'bp-2', name: 'Parts run', blueprintTypeID: 9841, updatedAt: 2 })
    );
    render(<App />);
    await openMaterialMenu('Mechanical Parts');

    await user.click(screen.getByRole('menuitem', { name: 'Build Plan' }));

    const row = await screen.findByRole('button', { name: 'Parts run' });
    await waitFor(() => expect(row.closest('li')).toHaveClass('bg-panel-2'));
    expect(await db.buildPlans.where('characterId').equals(CHAR_ID).count()).toBe(2);
  });

  it('opens Item Detail for the right-clicked material via Show info', async () => {
    server.use(
      http.get('https://esi.evetech.net/universe/types/9840', () =>
        HttpResponse.json({
          type_id: 9840,
          name: 'Mechanical Parts',
          description: 'Basic construction components.',
          group_id: 428,
          published: true,
          volume: 0.03,
          dogma_attributes: [{ attribute_id: STRUCTURE_HITPOINTS_ATTR_ID, value: 1200 }],
        })
      )
    );
    const user = userEvent.setup();
    await db.buildPlans.add(seedPlan());
    render(<App />);
    await openMaterialMenu('Mechanical Parts');

    await user.click(screen.getByRole('menuitem', { name: 'Show info' }));

    const dialog = await screen.findByRole('dialog', { name: 'Mechanical Parts' });
    expect(within(dialog).getByText('Basic construction components.')).toBeInTheDocument();
    expect(within(dialog).getByText('Structure Hitpoints')).toBeInTheDocument();
  });

  it('keeps the detail pane open on the new material plan below `lg`', async () => {
    // Narrow screens show one column at a time, and `detailVisible` is gated
    // on the *explicit* selection — so the render-time `?product=` sync has to
    // set it, or choosing Build Plan here would drop the visitor back to the
    // list with nothing open.
    useNarrowViewport();
    const user = userEvent.setup();
    await db.buildPlans.add(seedPlan());
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Rifter run' }));
    await openMaterialMenu('Mechanical Parts');
    await user.click(screen.getByRole('menuitem', { name: 'Build Plan' }));

    expect(await screen.findByRole('heading', { name: 'Mechanical Parts' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to build plans' })).toBeInTheDocument();
  });

  it('adds the right-clicked material to the Quickbar', async () => {
    const user = userEvent.setup();
    await db.buildPlans.add(seedPlan());
    render(<App />);
    await openMaterialMenu('Mechanical Parts');

    await user.click(screen.getByRole('menuitem', { name: 'Add to Quickbar' }));

    await waitFor(async () => {
      const record = await db.quickbars.get(String(CHAR_ID));
      expect(record?.items).toEqual([{ typeId: 9840, name: 'Mechanical Parts' }]);
    });
  });
});

describe('Industry: make-or-buy marker on materials', () => {
  /** The marker inside a named material's row, or null when the row carries none. */
  async function markerFor(name: string) {
    const row = (await screen.findByText(name)).closest('tr');
    if (!row) throw new Error(`expected a ${name} materials row`);
    return within(row).queryByRole('img');
  }

  it('marks a material this plan is better off building, priced against its own job', async () => {
    await db.buildPlans.add(seedPlan());
    render(<App />);

    // 10 Mechanical Parts means 2 runs of 9841: 40 Tritanium at 10 = 400,
    // plus a fee on an EIV of 320 (index 16 + SCC 12.8 + NPC tax 0.8) —
    // 42.96 each against the hub's 50.
    // The row renders as soon as the plan does; the verdict has to wait for
    // the market snapshot behind it.
    await waitFor(async () =>
      expect(await markerFor('Mechanical Parts')).toHaveAccessibleName(
        'Cheaper to build: 42.96 a unit to manufacture at ME 0%, against 50.00 to buy. ' +
          'Worth 70 across the 10 units still to buy.'
      )
    );
  });

  it('quotes the sub-job at the ME of a blueprint the character owns', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/blueprints`, () =>
        HttpResponse.json([
          {
            item_id: 1,
            type_id: 9841,
            runs: -1,
            material_efficiency: 10,
            time_efficiency: 20,
            quantity: 1,
          },
        ])
      )
    );
    await db.buildPlans.add(seedPlan());
    render(<App />);

    // ME10 takes the same 2 runs down to 36 Tritanium: 389.6 over 10 units.
    await waitFor(async () =>
      expect(await markerFor('Mechanical Parts')).toHaveAccessibleName(/38\.96 a unit .* at ME 10%/)
    );
  });

  it('leaves minerals unmarked — nothing in the SDE produces them', async () => {
    await db.buildPlans.add(seedPlan());
    render(<App />);
    // Wait for a row that does get a verdict, so this can't pass just by
    // reading the table before the snapshot lands.
    await waitFor(async () => expect(await markerFor('Mechanical Parts')).not.toBeNull());

    expect(await markerFor('Tritanium')).toBeNull();
    expect(await markerFor('Pyerite')).toBeNull();
  });

  it('gives no verdict at all when prices are unreachable — a fee-free quote would flatter every build', async () => {
    server.use(
      http.get('https://esi.evetech.net/markets/prices', () => HttpResponse.error()),
      http.get('https://esi.evetech.net/industry/systems', () => HttpResponse.error())
    );
    await db.buildPlans.add(seedPlan());
    render(<App />);
    expect(await screen.findByText('Price data unavailable')).toBeInTheDocument();

    expect(await markerFor('Mechanical Parts')).toBeNull();
  });
});

describe('Industry: hide fully-owned material rows (#409)', () => {
  it('hides a fully-owned material row when toggled, and shows it again when toggled off', async () => {
    await db.buildPlans.add(
      seedPlan({ materialSourcing: { 34: { ownedQuantity: 100 } } }) // Tritanium: fully owned (needs 100)
    );
    render(<App />);

    expect(await screen.findByText('Tritanium')).toBeInTheDocument();
    expect(screen.getByText('Pyerite')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Hide owned' }));

    expect(screen.queryByText('Tritanium')).not.toBeInTheDocument();
    expect(screen.getByText('Pyerite')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Hide owned' }));

    expect(screen.getByText('Tritanium')).toBeInTheDocument();
  });
});
