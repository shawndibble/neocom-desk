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
    activity: 'manufacturing',
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
  // The `?product=` deep link resolves through `Industry.tsx` before landing
  // on the plan's own page (`BuildPlanContextMenu`'s "Build Plan" action),
  // and that route loads this unconditionally for its Opportunities tab.
  loadMarketWideTrees: vi.fn(async () => ({})),
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
  // The plan panel reconciles its security band against the system it builds
  // in (`useDerivedSecurityBand`). Tama is lowsec, Badivefi highsec.
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

/** The plan's inputs fold behind "Edit setup"; tests that read them open it first. */
async function openSetup(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Edit setup' }));
}

// `useIsDesktop()` drives more than the old list/detail split (now gone) —
// the Costs panel's own default-expanded state falls back to it too
// (`BuildPlanDetail.tsx`'s `costsExpanded = costsOpen ?? isDesktop`). jsdom's
// unstubbed `matchMedia` never matches, i.e. it reads as narrow, which would
// collapse that panel by default and hide everything this file asserts on.
const realMatchMedia = window.matchMedia;
function useDesktopViewport() {
  window.matchMedia = (media: string) =>
    ({
      media,
      matches: true,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

afterEach(() => {
  server.resetHandlers();
  clearMarketPriceCache();
  clearCostIndexCache();
  window.matchMedia = realMatchMedia;
});
beforeEach(async () => {
  useDesktopViewport();
  await db.characters.clear();
  await db.tokens.clear();
  await db.settings.clear();
  await db.skillPlans.clear();
  await db.esiCache.clear();
  await db.buildPlans.clear();
  await db.quickbars.clear();
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
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

  // Every test here is about `/industry/plans/:id` (`bp-1`, `seedPlan`'s
  // default id) directly — unlike the old `/industry` list+detail split,
  // nothing here falls back into a plan; a test that needs a different one
  // pushes its own path after seeding it.
  window.history.pushState({}, '', '/industry/plans/bp-1');
});

describe('IndustryPlanPage: jargon tooltips (UX-REVIEW #8)', () => {
  it('gives the facility tax input an accessible tooltip without polluting its label', async () => {
    const user = userEvent.setup();
    await db.buildPlans.add(seedPlan());
    render(<App />);

    await screen.findByRole('heading', { name: 'Rifter' });
    await openSetup(user);
    // ME/TE are no longer pilot-set inputs (Blueprint Acquisition, issue
    // #838): the setup chips show the resolved tier instead, with no
    // tooltip trigger of their own.
    expect(screen.queryByRole('button', { name: 'About ME' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'About TE' })).not.toBeInTheDocument();

    expect(screen.queryByRole('button', { name: 'About facility tax' })).not.toBeInTheDocument();
    // Facility folds behind "Override" now that the location search fills it.
    await user.click(screen.getByRole('button', { name: /Override/ }));
    await user.click(screen.getByRole('combobox', { name: 'Facility' }));
    await user.click(await screen.findByRole('option', { name: 'Raitaru' }));
    // The facility write is a read-modify-write transaction, so the tax field
    // appears on the render after the store reports it.
    expect(await screen.findByLabelText('Facility tax %')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'About facility tax' })).toBeInTheDocument();
  });
});

describe('IndustryPlanPage: build plan settings grouping (#120)', () => {
  it('groups Runs/ME/TE under Blueprint and the rest under Location & market', async () => {
    const user = userEvent.setup();
    await db.buildPlans.add(seedPlan());
    render(<App />);

    await screen.findByRole('heading', { name: 'Rifter' });
    await openSetup(user);
    expect(screen.getByText('Blueprint')).toBeInTheDocument();
    expect(screen.getByText('Location & market')).toBeInTheDocument();

    // Runs still renders as a field; ME/TE no longer do (Blueprint
    // Acquisition, issue #838, resolves them automatically — shown only as
    // setup chips, not editable inputs).
    expect(screen.getByLabelText('Runs')).toBeInTheDocument();
    expect(screen.getByLabelText('Trade hub')).toBeInTheDocument();
    // Rig and facility tax belong to a player structure. The seeded plan is an
    // NPC station, which has neither, so neither control is on screen.
    expect(screen.queryByLabelText('Rig')).toBeNull();
    expect(screen.queryByLabelText('Facility tax %')).toBeNull();
    // Facility and Build system fold behind "Override" — the search box fills
    // both, and the line under it states what the plan is set to.
    expect(screen.getByRole('button', { name: /Override/ })).toBeInTheDocument();
    // Security is no longer a control at all: it follows the build system.
    expect(screen.queryByLabelText('Security')).toBeNull();
  });
});

describe('IndustryPlanPage: /skills is stale until the character logs in', () => {
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

describe('IndustryPlanPage: results panel', () => {
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

describe('IndustryPlanPage: materials row context menu', () => {
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

  it('creates and opens a plan for a manufacturable material via Build Plan', async () => {
    const user = userEvent.setup();
    await db.buildPlans.add(seedPlan());
    render(<App />);
    await openMaterialMenu('Mechanical Parts');

    await user.click(screen.getByRole('menuitem', { name: 'Build Plan' }));

    // Round-trips through `/industry?product=` (`BuildPlanContextMenu`), the
    // same deep link the Market Browser's menu uses — the material's own
    // plan is created if missing, and the browser lands on its own page.
    await screen.findByRole('heading', { name: 'Mechanical Parts' });
    await waitFor(() => expect(window.location.pathname).not.toBe('/industry'));
    await waitFor(() => expect(window.location.search).toBe(''));
    const stored = await db.buildPlans.where('characterId').equals(CHAR_ID).toArray();
    expect(stored).toHaveLength(2);
    expect(stored.map((p) => p.blueprintTypeID)).toContain(9841);
  });

  it('opens an existing plan for that material instead of duplicating it', async () => {
    const user = userEvent.setup();
    await db.buildPlans.add(seedPlan());
    await db.buildPlans.add(
      seedPlan({ id: 'bp-2', name: 'Parts run', blueprintTypeID: 9841, updatedAt: 2 })
    );
    render(<App />);
    await openMaterialMenu('Mechanical Parts');

    await user.click(screen.getByRole('menuitem', { name: 'Build Plan' }));

    expect(await screen.findByRole('heading', { name: 'Mechanical Parts' })).toBeInTheDocument();
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

describe('IndustryPlanPage: make-or-buy marker on materials', () => {
  /**
   * The row's build/buy control — a real button once a recipe is known
   * (`MaterialsTable.tsx` unifies the old advisory marker and the build-here
   * toggle into one icon there), or null when nothing produces the material
   * at all. The price rationale itself lives in the control's tooltip, not
   * its accessible name — see the individual tests below.
   */
  async function controlFor(name: string) {
    const row = (await screen.findByText(name)).closest('tr');
    if (!row) throw new Error(`expected a ${name} materials row`);
    return within(row).queryByRole('button', { name: /^(Build|Buy) / });
  }

  it('marks a material this plan is better off building, priced against its own job', async () => {
    await db.buildPlans.add(seedPlan());
    render(<App />);

    // The control needs no prices to appear — only its tooltip's price
    // rationale does, so that's what has to wait for the market snapshot.
    const control = await screen.findByRole('button', {
      name: 'Build Mechanical Parts here instead of buying it',
    });
    fireEvent.pointerMove(control);
    const tooltip = await screen.findByRole('tooltip');

    // 10 Mechanical Parts means 2 runs of 9841: 40 Tritanium at 10 = 400,
    // plus a fee on an EIV of 320 (index 16 + SCC 12.8 + NPC tax 0.8) —
    // 42.96 each against the hub's 50.
    // Suggestion first, then the two prices, then what a click does — which
    // is the opposite of the suggestion here only when the row is already
    // built (docs/context/decisions).
    await waitFor(() =>
      expect(tooltip).toHaveTextContent(
        'Suggestion: Build ItBuild 42.96/u at ME 0% · Buy 50.00/u Saves 70 on 10Click to Build'
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

    const control = await screen.findByRole('button', {
      name: 'Build Mechanical Parts here instead of buying it',
    });
    fireEvent.pointerMove(control);
    const tooltip = await screen.findByRole('tooltip');

    // ME10 takes the same 2 runs down to 36 Tritanium: 389.6 over 10 units.
    await waitFor(() => expect(tooltip).toHaveTextContent(/Build 38\.96\/u at ME 10%/));
  });

  it('leaves minerals with no control — nothing in the SDE produces them', async () => {
    await db.buildPlans.add(seedPlan());
    render(<App />);
    // Wait for the row that does get a control, so this can't pass just by
    // reading the table before it renders.
    await screen.findByRole('button', { name: 'Build Mechanical Parts here instead of buying it' });

    expect(await controlFor('Tritanium')).toBeNull();
    expect(await controlFor('Pyerite')).toBeNull();
  });

  it('gives no price rationale when prices are unreachable — a fee-free quote would flatter every build', async () => {
    server.use(
      http.get('https://esi.evetech.net/markets/prices', () => HttpResponse.error()),
      http.get('https://esi.evetech.net/industry/systems', () => HttpResponse.error())
    );
    await db.buildPlans.add(seedPlan());
    render(<App />);
    expect(await screen.findByText('Price data unavailable')).toBeInTheDocument();

    // The control itself still needs no prices to offer building; only the
    // suggestion does, and that never arrives here. The bubble is then just
    // what a click will do — never the bare action label, which read as a
    // recommendation rather than a description.
    const control = await screen.findByRole('button', {
      name: 'Build Mechanical Parts here instead of buying it',
    });
    fireEvent.pointerMove(control);
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('Click to Build');
    expect(tooltip).not.toHaveTextContent('Suggestion:');
  });
});

describe('IndustryPlanPage: owned-stock scope (#454)', () => {
  it('defaults to Everywhere, and persists Selected locations to the plan', async () => {
    const user = userEvent.setup();
    const plan = seedPlan();
    await db.buildPlans.add(plan);
    render(<App />);

    await screen.findByRole('heading', { name: 'Rifter' });
    const select = screen.getByRole('combobox', { name: 'Owned Material Source' });
    expect(select).toHaveTextContent('Everywhere');

    await user.click(select);
    await user.click(await screen.findByRole('option', { name: 'Selected locations' }));
    // The write is a read-modify-write transaction, so the value reaches the
    // control on the render after the store reports it, not synchronously.
    await waitFor(() => expect(select).toHaveTextContent('Selected locations'));

    // No Characters are authenticated in this test, so there is no detected
    // stock to choose locations from yet.
    expect(
      screen.getByText('No detected owned stock yet to choose locations from.')
    ).toBeInTheDocument();

    await waitFor(async () => {
      expect((await db.buildPlans.get(plan.id))?.ownedStockScope).toEqual({
        mode: 'selected',
        locations: [],
      });
    });

    await user.click(select);
    await user.click(await screen.findByRole('option', { name: 'Everywhere' }));
    await waitFor(async () => {
      expect((await db.buildPlans.get(plan.id))?.ownedStockScope).toBeUndefined();
    });
  });
});

describe('IndustryPlanPage: not-found handling', () => {
  it('sends the pilot back to the index for a plan id that does not exist', async () => {
    render(<App />);
    await waitFor(() => expect(window.location.pathname).toBe('/industry'));
  });

  it("sends the pilot back to the index for another character's plan", async () => {
    await db.characters.put({
      characterId: 92,
      name: 'Pilot Two',
      ownerHash: 'oh2',
      addedAt: 2,
    });
    await db.buildPlans.add(seedPlan({ characterId: 92 }));
    render(<App />);
    await waitFor(() => expect(window.location.pathname).toBe('/industry'));
  });
});
