import { vi } from 'vitest';
import type { SolarSystemResolution } from '@/features/character/systemLookup';

export const loadMarketSnapshot = vi.fn(async (): Promise<Record<string, unknown>> => ({
  hubPrices: {},
  hubBuyPrices: {},
  adjustedPrices: {},
  systemCostIndex: 0.05,
  systemCostIndexMissing: false,
}));
export const priceVsMedianMock = () => ({ loadPriceVsMedian: async () => null });
export const marketDataMock = () => ({
  loadMarketSnapshot,
  loadSystemCostIndices: async () => null,
});
export const pricesMock = (original: typeof import('@/market/prices')) => ({
  ...original,
  getHubPrices: async (_hub: unknown, ids: number[]) =>
    new Map(ids.map((id) => [id, { sellMin: null, buyMax: null, sellVolume: 0, buyVolume: 0 }])),
  getRegionSellPrices: async (_regionId: number, ids: readonly number[]) =>
    new Map(ids.map((id) => [id, id === 638 ? 150_000_000 : null])),
});

export const resolveSolarSystem = vi.fn(async (name: string): Promise<SolarSystemResolution> =>
  name.trim().toLowerCase() === 'badivefi'
    ? {
        status: 'found',
        system: { id: 30003888, name: 'Badivefi', security: 'highsec' as const },
      }
    : { status: 'notFound' }
);
export const systemLookupMock = () => ({ resolveSolarSystem });

export const breakEvenRuns = vi.fn<(...args: unknown[]) => number | null>();
export const breakEvenRunsMock = (original: typeof import('@/engine/industry/breakEvenRuns')) => ({
  ...original,
  breakEvenRuns,
});

export const loadSystemSecurity = vi.fn(async (systemId: number) =>
  systemId === 30003888 ? 0.6587 : systemId === 30002813 ? 0.2825 : null
);
export const systemSecurityMock = () => ({
  loadSystemSecurity,
  loadSystemName: vi.fn(async () => null),
});

export const implantsGrant = { lacking: new Set<number>() };
export const grantedScopesMock = () => ({
  useGrantedScopes: () => ['esi-search.search_structures.v1'],
  useCharacterLacksEndpoints: (id: number | null) => id !== null && implantsGrant.lacking.has(id),
  useCharacterIdsWithScopes: () => new Set<number>(),
});
