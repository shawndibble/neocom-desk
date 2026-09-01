import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { db, type BuildPlanRecord } from '@/db';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { useAuthFailure } from '@/stores/authFailure';
import { App } from '@/app/App';
import { buildVsBuy } from '@/engine/industry/buildVsBuy';
import { FACILITY_PRESETS } from '@/engine/industry/types';
import { formatCostIndex } from '@/features/industry/format';
import { formatIsk } from '@/lib/isk';
import { clearMarketPriceCache } from '@/market/prices';
import { clearCostIndexCache } from '@/features/industry/marketData';
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
}));

const CHAR_ID = 91;
const emptySkillsPayload = { skills: [], total_sp: 0, unallocated_sp: 0 };

let fuzzworkStations: number[] = [];

function fuzzworkHandler() {
  return http.get('https://market.fuzzwork.co.uk/aggregates/', ({ request }) => {
    const url = new URL(request.url);
    fuzzworkStations.push(Number(url.searchParams.get('station')));
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
afterEach(() => {
  server.resetHandlers();
  clearMarketPriceCache();
  clearCostIndexCache();
});
beforeEach(async () => {
  fuzzworkStations = [];
  await db.characters.clear();
  await db.tokens.clear();
  await db.settings.clear();
  await db.skillPlans.clear();
  await db.esiCache.clear();
  await db.buildPlans.clear();
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
  vi.spyOn(window, 'confirm').mockReturnValue(true);

  window.history.pushState({}, '', '/industry');
});

describe('Industry: Build Plan CRUD', () => {
  it('creates via blueprint search (by product name), renames, duplicates, and deletes, persisted in Dexie', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'New plan' }));
    const search = await screen.findByRole('textbox', { name: 'Add build plan' });
    await user.type(search, 'Rift');
    await user.click(await screen.findByRole('button', { name: /Rifter/ }));

    expect(await screen.findByRole('button', { name: 'Rifter' })).toBeInTheDocument();
    const stored = await db.buildPlans.where('characterId').equals(CHAR_ID).toArray();
    expect(stored).toHaveLength(1);
    expect(stored[0].blueprintTypeID).toBe(638);
    expect(stored[0].name).toBe('Rifter');

    await user.click(screen.getByRole('button', { name: 'Rename Rifter' }));
    const renameInput = screen.getByRole('textbox', { name: 'Rename' });
    await user.clear(renameInput);
    await user.type(renameInput, 'Rifter run{Enter}');
    expect(await screen.findByRole('button', { name: 'Rifter run' })).toBeInTheDocument();

    const row = screen.getByRole('button', { name: 'Rifter run' }).closest('li')!;
    await user.click(within(row).getByRole('button', { name: 'Duplicate' }));
    expect(await screen.findByRole('button', { name: 'Rifter run (copy)' })).toBeInTheDocument();
    expect(await db.buildPlans.where('characterId').equals(CHAR_ID).count()).toBe(2);

    const originalRow = screen.getByRole('button', { name: 'Rifter run' }).closest('li')!;
    await user.click(within(originalRow).getByRole('button', { name: 'Delete' }));
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
    expect(window.confirm).toHaveBeenCalled();
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
    const search = await screen.findByRole('textbox', { name: 'Add build plan' });
    await user.type(search, 'Rift');
    await user.click(await screen.findByRole('button', { name: /Rifter/ }));

    await screen.findByRole('button', { name: 'Rifter' });
    expect(screen.getByLabelText('ME')).toHaveValue(8);
    expect(screen.getByLabelText('TE')).toHaveValue(16);
    expect(screen.getByText('Owned, ME8/TE16')).toBeInTheDocument();

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
    // Labels stay exact ("ME"/"TE") — the tooltip trigger lives outside the <label>.
    expect(screen.getByLabelText('ME')).toBeInTheDocument();
    expect(screen.getByLabelText('TE')).toBeInTheDocument();
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
    expect(screen.getByLabelText('ME')).toBeInTheDocument();
    expect(screen.getByLabelText('TE')).toBeInTheDocument();
    expect(screen.getByLabelText('Facility')).toBeInTheDocument();
    expect(screen.getByLabelText('Rig')).toBeInTheDocument();
    expect(screen.getByLabelText('Security')).toBeInTheDocument();
    expect(screen.getByLabelText('Trade hub')).toBeInTheDocument();
  });
});

const RIFTER_BLUEPRINT = {
  name: 'Rifter Blueprint',
  time: 1200,
  materials: [
    { typeID: 34, quantity: 100 },
    { typeID: 35, quantity: 50 },
    { typeID: 9840, quantity: 10 },
  ],
  products: [{ typeID: 587, quantity: 1 }],
};

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
  it('flags an unpriced material, wires displayed totals (including the job fee breakdown and unit vs. sell-value product price) to buildVsBuy, then refetches on hub switch', async () => {
    const user = userEvent.setup();
    // runs: 2, not 1 — at runs 1 a unit price and the job's gross sell value
    // are numerically identical, which would hide a unit-price/revenue mixup.
    await db.buildPlans.add(seedPlan({ runs: 2 }));
    render(<App />);

    const pyeriteRow = (await screen.findByText('Pyerite')).closest('tr')!;
    expect(within(pyeriteRow).getByText('No price')).toBeInTheDocument();
    expect(await screen.findByText(/1 material\(s\) have no hub price/)).toBeInTheDocument();

    const expected = buildVsBuy({
      blueprint: RIFTER_BLUEPRINT,
      runs: 2,
      me: 0,
      te: 0,
      facility: FACILITY_PRESETS.npcStation,
      rig: 'none',
      security: 'highsec',
      facilityTaxPct: undefined,
      systemCostIndex: 0.05,
      adjustedPrices: { 34: 8, 35: 3, 9840: 20 },
      hubPrices: { 34: 10, 9840: 50, 587: 100_000 },
      skills: {},
    });
    expect(expected.unpriceable).toBe(true);
    expect(expected.recommendation).toBe('unknown');
    // Sanity check on the test's own fixture: unit price and gross sell
    // value must differ, or the assertions below can't tell them apart.
    expect(expected.buyCost).not.toBe(100_000);

    // Job fee breakdown, not just the total.
    expect(screen.getByText(formatIsk(expected.jobFee.eiv))).toBeInTheDocument();
    expect(screen.getByText(formatIsk(expected.jobFee.grossCost))).toBeInTheDocument();
    expect(screen.getByText(formatIsk(expected.jobFee.sccSurcharge))).toBeInTheDocument();
    expect(screen.getByText(formatIsk(expected.jobFee.facilityTax))).toBeInTheDocument();
    expect(screen.getByText(formatIsk(expected.jobFee.total))).toBeInTheDocument();

    expect(screen.getByText(formatIsk(expected.materialCost))).toBeInTheDocument();
    expect(screen.getByText(formatIsk(expected.totalCost))).toBeInTheDocument();
    expect(screen.getByText(formatCostIndex(0.05))).toBeInTheDocument();

    // Product sell price is the unit price (100,000), distinct from the
    // job's gross sell value (buyCost = 2 runs x 100,000 = 200,000).
    expect(screen.getByText(formatIsk(100_000))).toBeInTheDocument();
    expect(screen.getByText(formatIsk(expected.buyCost!))).toBeInTheDocument();

    expect(
      screen.getByText('Not enough price data for a build-vs-buy verdict.')
    ).toBeInTheDocument();

    expect(fuzzworkStations).toContain(60003760); // Jita 4-4

    await user.selectOptions(screen.getByLabelText('Trade hub'), 'amarr');

    await screen.findByText(formatCostIndex(0.002));
    expect(fuzzworkStations).toContain(60008494); // Amarr
  });

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

    expect(screen.getByText('Price data unavailable')).toBeInTheDocument();
    expect(screen.queryByText('Not enough price data for a build-vs-buy verdict.')).toBeNull();
  });
});
