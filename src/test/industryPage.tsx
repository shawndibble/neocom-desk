import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { db, type BuildPlanRecord } from '@/db';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { useAuthFailure } from '@/stores/authFailure';
import { App } from '@/app/App';
import * as routeChunks from '@/app/routeChunks';
import { clearMarketPriceCache } from '@/market/prices';
import { clearCostIndexCache } from '@/features/industry/marketData';
import { useBuildGroups } from '@/features/industry/buildGroups';
import {
  DEFAULT_FACILITY_DEFAULTS,
  useFacilityDefaults,
} from '@/features/industry/facilityDefaults';
import {
  DEFAULT_REACTION_FACILITY_DEFAULTS,
  useReactionFacilityDefaults,
} from '@/features/industry/reactionFacilityDefaults';

// Shared harness for the Industry route tests (src/routes/Industry*.test.tsx), one
// file per concern so CI runs them in parallel. The `vi.mock` calls stay in each
// test file; their factories live in industryMocks.tsx.

export const CHAR_ID = 91;
export const emptySkillsPayload = { skills: [], total_sp: 0, unallocated_sp: 0 };

export function fuzzworkHandler() {
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

export const server = setupServer(
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
  fuzzworkHandler(),
  // Reads this suite does not assert on, answered with a network error: the same
  // failure an unhandled request gives, without MSW logging each one.
  http.get('https://esi.evetech.net/characters/:id', () => HttpResponse.error()),
  http.get('https://esi.evetech.net/characters/:id/implants', () => HttpResponse.error()),
  http.get('https://esi.evetech.net/characters/:id/loyalty/points', () => HttpResponse.error()),
  http.get('https://esi.evetech.net/markets/:regionId/orders', () => HttpResponse.error()),
  http.get('https://esi.evetech.net/markets/:regionId/history', () => HttpResponse.error())
);

export function seedPlan(overrides: Partial<BuildPlanRecord> = {}): BuildPlanRecord {
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

export async function resetSession() {
  await db.characters.clear();
  await db.tokens.clear();
  await db.settings.clear();
  await db.skillPlans.clear();
  await db.esiCache.clear();
  await db.buildPlans.clear();
  await db.productionRuns.clear();
  await db.quickbars.clear();
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
  // Module-scope store, so it outlives a test unless it is put back — same
  // reason `useLastOpenedPlan` used to need this.
  useBuildGroups.setState({ value: {}, hydrated: false });
  // Plan-page location edits write these, so they must not carry between tests.
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

  window.history.pushState({}, '', '/industry');
}

export async function seedRun() {
  await db.productionRuns.add({
    id: 'run-1',
    characterId: CHAR_ID,
    buildPlanId: 'plan-1',
    productTypeID: 587,
    quantity: 1,
    materialCost: 1,
    jobFee: 0,
    totalCost: 1,
    loggedAt: 1,
    updatedAt: 1,
  });
}

/** Registers the MSW lifecycle, the warm-up render and the per-test reset. Call once at module scope. */
export function installIndustryHarness(): void {
  afterAll(() => server.close());
  afterEach(() => {
    server.resetHandlers();
    clearMarketPriceCache();
    clearCostIndexCache();
  });
  beforeAll(async () => {
    server.listen({ onUnhandledRequest: 'error' });
    // One throwaway render, so no test pays for the first one: a worker's first
    // `App` render (lazy route chunks, jsdom and React warm-up) took over the
    // 5s `findBy*` budget on its own and failed whichever test ran first.
    // Same fix as `IndustryPlanPage.test.tsx`, paid under this hook's budget.
    await routeChunks.loadIndustry();
    await resetSession();
    const { unmount } = render(<App />);
    await screen.findByRole('searchbox', { name: 'Add Build Plan' }, { timeout: 25_000 });
    unmount();
    server.resetHandlers();
    clearMarketPriceCache();
    clearCostIndexCache();
  }, 30_000);
  beforeEach(resetSession);
}
