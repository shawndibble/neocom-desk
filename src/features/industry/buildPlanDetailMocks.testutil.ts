import { vi } from 'vitest';
import type { SolarSystemResolution } from '@/features/character/systemLookup';

// Spies and `vi.mock` factories for the BuildPlanDetail tests
// (BuildPlanDetail*.test.tsx). Kept free of app imports (types only): a `vi.mock`
// factory imports this module while the app graph is still loading.

// BuildPlanDetail fetches a market snapshot in an effect on mount; a real
// fetch would hit ESI/Fuzzwork and never resolve under MSW's default
// handlers here. The panel only needs *a* resolved snapshot to stop showing
// "loading" — its shape doesn't matter to the Runs/ME/TE fields under test.
export const loadMarketSnapshot = vi.fn(async (): Promise<Record<string, unknown>> => ({
  hubPrices: {},
  hubBuyPrices: {},
  adjustedPrices: {},
  systemCostIndex: 0.05,
  systemCostIndexMissing: false,
}));
// The "vs 90d" figures read market history; nothing here is about them.
export const priceVsMedianMock = () => ({ loadPriceVsMedian: async () => null });
// No neighbour indices: the ledger's cheaper-system line stays out of these tests.
export const marketDataMock = () => ({
  loadMarketSnapshot,
  loadSystemCostIndices: async () => null,
});
// The blueprint-offer and invention loaders price through Fuzzwork directly,
// and there is no msw server here: unmocked, the Break Even button's profit
// (and `pricesReady`) rode on a live request for the Rifter Blueprint's region
// sell price, so it flaked with Fuzzwork's latency on CI. 150M is the figure the
// Break Even tests' comments assume.
export const pricesMock = (original: typeof import('@/market/prices')) => ({
  ...original,
  getHubPrices: async (_hub: unknown, ids: number[]) =>
    new Map(ids.map((id) => [id, { sellMin: null, buyMax: null, sellVolume: 0, buyVolume: 0 }])),
  getRegionSellPrices: async (_regionId: number, ids: readonly number[]) =>
    new Map(ids.map((id) => [id, id === 638 ? 150_000_000 : null])),
});

// The build-system field resolves a typed name through ESI. Mocked here for the
// same reason as the snapshot: the panel under test needs an answer, not a network.
export const resolveSolarSystem = vi.fn(async (name: string): Promise<SolarSystemResolution> =>
  name.trim().toLowerCase() === 'badivefi'
    ? {
        status: 'found',
        system: { id: 30003888, name: 'Badivefi', security: 'highsec' as const },
      }
    : { status: 'notFound' }
);
export const systemLookupMock = () => ({ resolveSolarSystem });

// The search's own maths is tested in `breakEvenRuns.test.ts`; here only the
// button's wiring is under test, so its answer is set per test.
export const breakEvenRuns = vi.fn<(...args: unknown[]) => number | null>();
export const breakEvenRunsMock = (original: typeof import('@/engine/industry/breakEvenRuns')) => ({
  ...original,
  breakEvenRuns,
});

// The band is reconciled on load against `/universe/systems/{id}`.
// Badivefi 0.6587 (highsec), Tama 0.2825 (lowsec); anything else unresolvable.
export const loadSystemSecurity = vi.fn(async (systemId: number) =>
  systemId === 30003888 ? 0.6587 : systemId === 30002813 ? 0.2825 : null
);
export const systemSecurityMock = () => ({
  loadSystemSecurity,
  loadSystemName: vi.fn(async () => null),
});

// The build location search only renders once the scope is known to be
// granted; without this the box under test is the re-auth offer instead.
export const implantsGrant = { lacking: new Set<number>() };
export const grantedScopesMock = () => ({
  useGrantedScopes: () => ['esi-search.search_structures.v1'],
  useCharacterLacksEndpoints: (id: number | null) => id !== null && implantsGrant.lacking.has(id),
  useCharacterIdsWithScopes: () => new Set<number>(),
});
