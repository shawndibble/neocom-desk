import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EMPTY_BLUEPRINT_CATALOG,
  type BlueprintCatalog,
} from '@/features/industry/blueprintCatalog';

const loadBlueprintCatalog = vi.fn();
vi.mock('@/features/industry/blueprintCatalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/industry/blueprintCatalog')>()),
  loadBlueprintCatalog: () => loadBlueprintCatalog(),
}));
const loadLoyaltyStoreOffersStatus = vi.fn();
vi.mock('./store', () => ({
  loadLoyaltyStoreOffersStatus: (id: number) => loadLoyaltyStoreOffersStatus(id),
  loadCorporationName: async () => 'Federal Navy Academy',
}));
vi.mock('@/features/industry/useMarketSnapshot', () => ({
  useMarketSnapshot: () => ({ snapshot: null, fetchedAt: null, loading: false }),
}));
vi.mock('@/features/industry/useDetectedOwnedStock', () => ({
  useOwnedStockSnapshot: () => ({}),
  useDetectedOwnedStock: () => ({ stock: new Map() }),
}));
vi.mock('@/features/market/useTradeHubStandings', () => ({
  useTradeHubStandings: () => ({}),
  tradeHubStanding: () => 0,
}));
vi.mock('@/features/character/typeNames', () => ({ loadTypeNames: async () => new Map() }));
vi.mock('@/features/character/loyalty', () => ({
  loadCharacterLoyaltyPoints: async () => ({ cached: null }),
}));
vi.mock('@/features/skills/correctedSkills', () => ({
  loadCorrectedSkills: async () => ({ trained: new Map() }),
}));

import { useLoyaltyStoreOffers } from './useLoyaltyStoreOffers';

const OFFER = {
  offer_id: 1,
  type_id: 34,
  quantity: 1,
  lp_cost: 100,
  isk_cost: 1000,
  required_items: [],
};

beforeEach(() => {
  loadBlueprintCatalog.mockReset().mockResolvedValue({
    ...EMPTY_BLUEPRINT_CATALOG,
    byBlueprintTypeID: new Map(),
  } as BlueprintCatalog);
  loadLoyaltyStoreOffersStatus.mockReset().mockResolvedValue({
    result: { data: [], fetchedAt: new Date(), fromCache: false },
    failed: false,
  });
});

describe('useLoyaltyStoreOffers', () => {
  it('is ready for a corporation with no offers, rather than waiting on prices it will never fetch', async () => {
    const { result } = renderHook(() => useLoyaltyStoreOffers(1000));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.rows).toEqual([]);
    expect(result.current.offersError).toBe(false);
  });

  it('is not ready while a store with offers still waits for its prices', async () => {
    loadLoyaltyStoreOffersStatus.mockResolvedValue({
      result: { data: [OFFER], fetchedAt: new Date(), fromCache: false },
      failed: false,
    });
    const { result } = renderHook(() => useLoyaltyStoreOffers(1000));
    await waitFor(() => expect(result.current.corpName).toBe('Federal Navy Academy'));
    expect(result.current.ready).toBe(false);
  });

  it('carries on without build-versus-buy data when the blueprint catalog cannot load', async () => {
    loadBlueprintCatalog.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useLoyaltyStoreOffers(1000));
    await waitFor(() => expect(result.current.catalogUnavailable).toBe(true));
    await waitFor(() => expect(result.current.ready).toBe(true));
  });
});
