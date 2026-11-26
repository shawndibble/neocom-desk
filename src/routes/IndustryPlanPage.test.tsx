import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, screen, within, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { db, type BuildPlanRecord } from '@/db';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { useAuthFailure } from '@/stores/authFailure';
import { resetRevalidationState } from '@/esi/cache';
import { clearCostIndexCache } from '@/features/industry/marketData';
import { useBuildGroups } from '@/features/industry/buildGroups';
import { useAssumedMe } from '@/features/industry/assumedMe';
import {
  DEFAULT_FACILITY_DEFAULTS,
  useFacilityDefaults,
} from '@/features/industry/facilityDefaults';
import {
  DEFAULT_REACTION_FACILITY_DEFAULTS,
  useReactionFacilityDefaults,
} from '@/features/industry/reactionFacilityDefaults';
import type { BlueprintMap, TypeMap } from '@/sde/types';
import { stubViewport } from '@/test/viewport';
import { holdHydration } from '@/test/holdHydration';
import { renderIndustryRoutes } from '@/test/industryRoutes';

vi.mock('@/features/market/priceVsMedian', () => ({ loadPriceVsMedian: async () => null }));

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
  loadMarketWideTrees: vi.fn(async () => ({})),
  loadSkillAttributeModifiers: vi.fn(async () => ({})),
  loadCompressedGasTypeIds: vi.fn(async () => ({})),
}));
vi.mock('@/sde/loadTypeInfo', () => ({ loadTypeInfo: vi.fn(async () => null) }));

vi.mock('@/sde/loadMarketSde', () => ({
  loadAttributeDictionary: vi.fn(async () => ({
    9: { name: 'Structure Hitpoints', unit: 'HP', category: 'Structure' },
  })),
  loadGlobalMarkets: vi.fn(async () => []),
  loadNpcStations: vi.fn(async () => []),
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

afterAll(() => server.close());

async function openSetup(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Edit setup' }));
}

function stubDesktopViewport() {
  stubViewport((query) => !query.includes('max-width'));
}

afterEach(async () => {
  cleanup();
  server.resetHandlers();
  clearCostIndexCache();
});
async function resetSession() {
  stubDesktopViewport();
  resetRevalidationState();
  await db.characters.clear();
  await db.tokens.clear();
  await db.settings.clear();
  await db.skillPlans.clear();
  await db.esiCache.clear();
  await db.buildPlans.clear();
  await db.quickbars.clear();
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
  useBuildGroups.setState({ value: {}, hydrated: false });
  useFacilityDefaults.setState({ value: DEFAULT_FACILITY_DEFAULTS, hydrated: false });
  useReactionFacilityDefaults.setState({
    value: DEFAULT_REACTION_FACILITY_DEFAULTS,
    hydrated: false,
  });
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

  window.history.pushState({}, '', '/industry/plans/bp-1');
}

beforeAll(async () => {
  server.listen({ onUnhandledRequest: 'error' });
  await resetSession();
  await db.buildPlans.add(seedPlan());
  const { unmount } = await renderIndustryRoutes();
  await screen.findByRole('heading', { name: 'Rifter' }, { timeout: 25_000 });
  const warmUser = userEvent.setup({ delay: null });
  await warmUser.click(await screen.findByRole('button', { name: 'Edit setup' }));
  await warmUser.click(screen.getByRole('button', { name: /Override/ }));
  await warmUser.click(screen.getByRole('combobox', { name: 'Facility' }));
  await screen.findByRole('option', { name: 'Raitaru' });
  unmount();
  server.resetHandlers();
  clearCostIndexCache();
}, 30_000);

beforeEach(resetSession);

describe('IndustryPlanPage: jargon tooltips (UX-REVIEW #8)', () => {
  it('gives the facility tax input an accessible tooltip without polluting its label', async () => {
    const user = userEvent.setup({ delay: null });
    await db.buildPlans.add(seedPlan());
    await renderIndustryRoutes();

    await screen.findByRole('heading', { name: 'Rifter' });
    await openSetup(user);
    expect(screen.queryByRole('button', { name: 'About ME' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'About TE' })).not.toBeInTheDocument();

    expect(screen.queryByRole('button', { name: 'About facility tax' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Override/ }));
    await user.click(screen.getByRole('combobox', { name: 'Facility' }));
    await user.click(await screen.findByRole('option', { name: 'Raitaru' }));
    expect(await screen.findByLabelText('Facility tax %')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'About facility tax' })).toBeInTheDocument();
  });
});

describe('IndustryPlanPage: build plan settings grouping (#120)', () => {
  it('keeps Runs in the hero and the rest under Location & market', async () => {
    const user = userEvent.setup({ delay: null });
    await db.buildPlans.add(seedPlan());
    await renderIndustryRoutes();

    await screen.findByRole('heading', { name: 'Rifter' });
    await openSetup(user);
    expect(screen.getByText('Location & market')).toBeInTheDocument();

    expect(screen.getByLabelText('Runs')).toBeInTheDocument();
    expect(screen.getByLabelText('Trade hub')).toBeInTheDocument();
    expect(screen.queryByLabelText('Rig')).toBeNull();
    expect(screen.queryByLabelText('Facility tax %')).toBeNull();
    expect(screen.getByRole('button', { name: /Override/ })).toBeInTheDocument();
    expect(screen.queryByLabelText('Security')).toBeNull();
  });
});

async function signInWithQueue(characterId: number, queue: unknown[]) {
  await db.characters.put({ characterId, name: 'Pilot Queue', ownerHash: 'ohq', addedAt: 3 });
  await db.tokens.put({
    characterId,
    accessToken: 'access-token-q',
    refreshToken: 'refresh',
    expiresAt: Date.now() + 3_600_000,
    scopes: ['esi-skills.read_skillqueue.v1'],
  });
  await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: characterId });
  const esi = `https://esi.evetech.net/characters/${characterId}`;
  server.use(
    http.get(`${esi}/skills`, () => HttpResponse.json(emptySkillsPayload)),
    http.get(`${esi}/blueprints`, () => HttpResponse.json([])),
    http.get(`${esi}/industry/jobs`, () => HttpResponse.json([])),
    http.get(`${esi}/skillqueue`, () => HttpResponse.json(queue))
  );
  await db.buildPlans.add(seedPlan({ characterId }));
}

describe('IndustryPlanPage: /skills is stale until the character logs in', () => {
  it('applies an Industry level the queue finished in the past, which /skills omits', async () => {
    await signInWithQueue(93, [
      {
        skill_id: 3380,
        queue_position: 0,
        finished_level: 5,
        start_date: '2026-01-01T00:00:00Z',
        finish_date: '2026-01-05T00:00:00Z',
      },
    ]);
    await renderIndustryRoutes();

    expect(await screen.findByText('16m')).toBeInTheDocument();
    expect(screen.queryByText('20m')).not.toBeInTheDocument();
  });

  it('does not credit a paused queue entry, which carries no finish date', async () => {
    await signInWithQueue(94, [{ skill_id: 3380, queue_position: 0, finished_level: 5 }]);
    await renderIndustryRoutes();

    expect(await screen.findByText('20m')).toBeInTheDocument();
  });

  it('skips the queue read and shows no reauth notice when the character never granted the queue scope', async () => {
    const SCOPELESS_ID = 92;
    await db.characters.put({
      characterId: SCOPELESS_ID,
      name: 'Pilot Two',
      ownerHash: 'oh2',
      addedAt: 2,
    });
    await db.tokens.put({
      characterId: SCOPELESS_ID,
      accessToken: 'access-token-2',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 3_600_000,
      scopes: [],
    });
    await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: SCOPELESS_ID });
    let queueRequests = 0;
    const esi = `https://esi.evetech.net/characters/${SCOPELESS_ID}`;
    server.use(
      http.get(`${esi}/skills`, () => HttpResponse.json(emptySkillsPayload)),
      http.get(`${esi}/blueprints`, () => HttpResponse.json([])),
      http.get(`${esi}/industry/jobs`, () => HttpResponse.json([])),
      http.get(`${esi}/skillqueue`, () => {
        queueRequests += 1;
        return HttpResponse.json([], { status: 403 });
      })
    );
    await db.buildPlans.add(seedPlan({ characterId: SCOPELESS_ID }));
    await renderIndustryRoutes();

    expect(await screen.findByText('20m')).toBeInTheDocument();
    expect(queueRequests).toBe(0);
    expect(screen.queryByText(/: log in again$/)).not.toBeInTheDocument();
  });
});

describe('IndustryPlanPage: results panel', () => {
  it('keeps materials and time visible, but shows an empty state instead of cost/profit, when prices are unreachable (offline)', async () => {
    server.use(
      http.get('https://esi.evetech.net/markets/prices', () => HttpResponse.error()),
      http.get('https://esi.evetech.net/industry/systems', () => HttpResponse.error())
    );
    await db.buildPlans.add(seedPlan());
    await renderIndustryRoutes();

    expect(await screen.findByText('Tritanium')).toBeInTheDocument();
    expect(screen.getByText('Pyerite')).toBeInTheDocument();
    expect(screen.getByText('20m')).toBeInTheDocument();

    expect((await screen.findAllByText('Prices unavailable right now')).length).toBeGreaterThan(0);
    expect(screen.queryByText('Price data unavailable')).toBeNull();
    expect(screen.queryByText(/Try again shortly/)).toBeNull();
    expect(screen.queryByText('Not enough price data for a build-vs-buy verdict.')).toBeNull();
  });
});

describe('IndustryPlanPage: Log production prefill from a job (#1787)', () => {
  it('opens Log Production already filled with the job’s quantity and cost', async () => {
    await db.buildPlans.add(seedPlan());
    window.history.pushState(
      { usr: { logProductionFromJob: { runs: 4, jobFee: 999 } } },
      '',
      '/industry/plans/bp-1'
    );
    await renderIndustryRoutes();

    await screen.findByRole('heading', { name: 'Rifter' });
    expect(await screen.findByRole('heading', { name: 'Log Production' })).toBeInTheDocument();
    expect(screen.getByLabelText('Qty')).toHaveValue('4');
    expect(screen.getByLabelText('Total job cost')).toHaveValue('999');
  });

  it('multiplies runs by the blueprint’s own per-run product quantity, not just the run count', async () => {
    await db.buildPlans.add(seedPlan({ id: 'bp-2', blueprintTypeID: 9841 }));
    window.history.pushState(
      { usr: { logProductionFromJob: { runs: 2, jobFee: 500 } } },
      '',
      '/industry/plans/bp-2'
    );
    await renderIndustryRoutes();

    await screen.findByRole('heading', { name: 'Mechanical Parts' });
    expect(await screen.findByRole('heading', { name: 'Log Production' })).toBeInTheDocument();
    expect(screen.getByLabelText('Qty')).toHaveValue('10');
  });

  it('does not reopen Log Production prefilled a second time from PlanVerdictHero’s own button', async () => {
    await db.buildPlans.add(seedPlan());
    window.history.pushState(
      { usr: { logProductionFromJob: { runs: 4, jobFee: 999 } } },
      '',
      '/industry/plans/bp-1'
    );
    const user = userEvent.setup({ delay: null });
    await renderIndustryRoutes();

    await screen.findByRole('heading', { name: 'Log Production' });
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('heading', { name: 'Log Production' })).not.toBeInTheDocument();

    const [heroButton] = await screen.findAllByRole('button', { name: 'Log Production' });
    await user.click(heroButton);
    expect(await screen.findByRole('heading', { name: 'Log Production' })).toBeInTheDocument();
    expect(screen.queryByDisplayValue('999')).not.toBeInTheDocument();
  });

  it('opens Log Production from Active Jobs’ own row button when its match is the plan already open', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/industry/jobs`, () =>
        HttpResponse.json([
          {
            job_id: 1,
            activity_id: 1,
            blueprint_type_id: 638,
            product_type_id: 587,
            facility_id: 60003760,
            station_id: 60003760,
            runs: 3,
            cost: 4500,
            start_date: '2020-01-01T00:00:00Z',
            end_date: '2020-01-01T01:00:00Z',
            status: 'active',
          },
        ])
      )
    );
    await db.buildPlans.add(seedPlan());
    await renderIndustryRoutes();

    await userEvent.click(await screen.findByLabelText('Show job list'));
    fireEvent.click(await screen.findByRole('button', { name: 'Log production' }));

    const dialog = await waitFor(() => {
      const open = document.querySelector<HTMLElement>('dialog[open]');
      if (!open) throw new Error('no open dialog yet');
      return open;
    });
    expect(within(dialog).getByRole('heading', { name: 'Log Production' })).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Qty')).toHaveValue('3');
    expect(within(dialog).getByLabelText('Total job cost')).toHaveValue('4,500');
  });
});

describe('IndustryPlanPage: materials row menu', () => {
  it('gives a material row the item menu on right-click and a More-actions button', async () => {
    await db.buildPlans.add(seedPlan());
    await renderIndustryRoutes();
    const row = (await screen.findByText('Mechanical Parts')).closest('tr');
    if (!row) throw new Error('expected a Mechanical Parts materials row');

    expect(within(row).getByRole('button', { name: /More actions/ })).toBeInTheDocument();
    fireEvent.contextMenu(row);
    expect(await screen.findByRole('menuitem', { name: 'Show info' })).toBeInTheDocument();
  });
});

describe('IndustryPlanPage: make-or-buy marker on materials', () => {
  async function controlFor(name: string) {
    const row = (await screen.findByText(name)).closest('tr');
    if (!row) throw new Error(`expected a ${name} materials row`);
    return within(row).queryByRole('button', { name: /^(Build|Buy) / });
  }

  it('marks a material this plan is better off building, priced against its own job', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/blueprints`, () =>
        HttpResponse.json([
          {
            item_id: 1,
            type_id: 9841,
            runs: -1,
            material_efficiency: 0,
            time_efficiency: 0,
            quantity: -1,
          },
        ])
      )
    );
    await db.buildPlans.add(seedPlan());
    await renderIndustryRoutes();

    const control = await screen.findByRole('button', {
      name: 'Build instead: Mechanical Parts',
    });
    fireEvent.pointerMove(control);
    const tooltip = await screen.findByRole('tooltip');

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
    await renderIndustryRoutes();

    const control = await screen.findByRole('button', {
      name: 'Build instead: Mechanical Parts',
    });
    fireEvent.pointerMove(control);
    const tooltip = await screen.findByRole('tooltip');

    await waitFor(() => expect(tooltip).toHaveTextContent(/Build 38\.96\/u at ME 10%/));
  });

  it('leaves minerals with no control — nothing in the SDE produces them', async () => {
    await db.buildPlans.add(seedPlan());
    await renderIndustryRoutes();
    await screen.findByRole('button', { name: 'Build instead: Mechanical Parts' });

    expect(await controlFor('Tritanium')).toBeNull();
    expect(await controlFor('Pyerite')).toBeNull();
  });

  it('gives no price rationale when prices are unreachable — a fee-free quote would flatter every build', async () => {
    server.use(
      http.get('https://esi.evetech.net/markets/prices', () => HttpResponse.error()),
      http.get('https://esi.evetech.net/industry/systems', () => HttpResponse.error())
    );
    await db.buildPlans.add(seedPlan());
    await renderIndustryRoutes();
    expect((await screen.findAllByText('Prices unavailable right now')).length).toBeGreaterThan(0);

    const control = await screen.findByRole('button', {
      name: 'Build instead: Mechanical Parts',
    });
    fireEvent.pointerMove(control);
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('Click to Build');
    expect(tooltip).not.toHaveTextContent('Suggestion:');
  });
});

describe('IndustryPlanPage: owned-stock scope (#454)', () => {
  it('defaults to Everywhere, and persists Selected locations to the plan', async () => {
    const user = userEvent.setup({ delay: null });
    const plan = seedPlan();
    await db.buildPlans.add(plan);
    await renderIndustryRoutes();

    await screen.findByRole('heading', { name: 'Rifter' });
    await user.click(screen.getByRole('button', { name: /^Owned materials/ }));
    const select = screen.getByRole('combobox', { name: 'Owned Material Source' });
    expect(select).toHaveTextContent('Everywhere');

    await user.click(select);
    await user.click(await screen.findByRole('option', { name: 'Selected locations' }));
    await waitFor(() => expect(select).toHaveTextContent('Selected locations'));

    expect(
      screen.getByText('No owned stock found yet, so there are no locations to choose.')
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
    await renderIndustryRoutes();
    await waitFor(() => expect(window.location.pathname).toBe('/industry/plans'));
  });

  it("sends the pilot back to the index for another character's plan", async () => {
    await db.characters.put({
      characterId: 92,
      name: 'Pilot Two',
      ownerHash: 'oh2',
      addedAt: 2,
    });
    await db.buildPlans.add(seedPlan({ characterId: 92 }));
    await renderIndustryRoutes();
    await waitFor(() => expect(window.location.pathname).toBe('/industry/plans'));
  });
});

describe('IndustryPlanPage: waits for the pricing-settings hydration gate (#2054)', () => {
  it('shows a spinner instead of the plan, and never mounts it, until Assumed ME hydrates', async () => {
    const assumedMe = holdHydration(useAssumedMe, 0);
    await db.buildPlans.add(seedPlan());
    try {
      await renderIndustryRoutes();

      expect((await screen.findAllByRole('status', { name: 'Loading' })).length).toBeGreaterThan(0);
      expect(screen.queryByRole('heading', { name: 'Rifter' })).not.toBeInTheDocument();
      assumedMe.release();
    } finally {
      assumedMe.restore();
    }

    await screen.findByRole('heading', { name: 'Rifter' });
  });
});
