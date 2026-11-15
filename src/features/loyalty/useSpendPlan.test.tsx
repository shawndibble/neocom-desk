import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { DEFAULT_TRADE_HUB } from '@/market/hubs';
import type { LoyaltyOfferRow } from './offerRows';

const loadLiveBooks = vi.fn();
vi.mock('@/features/market/liveBooks', () => ({
  loadLiveBooks: (...args: unknown[]) => loadLiveBooks(...args),
}));
vi.mock('@/features/market/hubJumps', () => ({ loadHubJumps: () => Promise.resolve(undefined) }));
vi.mock('@/features/character/wallet', () => ({
  loadWalletBalance: () => Promise.resolve({ data: 5_000_000 }),
}));
vi.mock('./marketLpValue', () => ({ loadMarketLpValue: () => Promise.resolve(null) }));

const { useSpendPlan, spendCandidates, SPEND_PLAN_CANDIDATES } = await import('./useSpendPlan');

function offerRow(id: number, iskPerLp: number | null, over: Partial<LoyaltyOfferRow> = {}) {
  return {
    offer: {
      offer_id: id,
      type_id: 600 + id,
      lp_cost: 100,
      isk_cost: 0,
      quantity: 1,
      required_items: [],
    },
    itemName: `Item ${id}`,
    isBlueprint: false,
    productTypeId: null,
    productName: null,
    build: null,
    requiredItems: [],
    revenueCheck: null,
    profit: { iskPerLp },
    ...over,
  } as unknown as LoyaltyOfferRow;
}

afterEach(() => loadLiveBooks.mockReset());

describe('spendCandidates', () => {
  it('takes the best offers by ISK/LP, leaving unranked ones out', () => {
    const rows = [
      offerRow(1, 500),
      offerRow(2, null),
      ...Array.from({ length: 12 }, (_, i) => offerRow(10 + i, 1000 + i)),
    ];
    const picked = spendCandidates(rows, null);
    expect(picked).toHaveLength(SPEND_PLAN_CANDIDATES);
    expect(picked[0]!.candidate).toMatchObject({ offerId: 21, outputTypeId: 621, outputUnits: 1 });
    expect(picked.map((p) => p.candidate.offerId)).not.toContain(2);
    expect(picked.map((p) => p.candidate.offerId)).not.toContain(1);
  });
});

describe('useSpendPlan', () => {
  const args = {
    corporationId: 1000125,
    rows: [offerRow(1, 900)],
    catalog: null,
    hub: DEFAULT_TRADE_HUB,
    skills: {},
    standing: undefined,
    playerLp: 1_000,
    ownedStock: { sources: [], characterNames: new Map(), incompleteCharacters: [] },
    activeCharacterId: 90000001,
  };

  it('reads no book until the plan is asked for', async () => {
    loadLiveBooks.mockImplementation(
      (
        requests: { hub: unknown; typeId: number }[],
        onSettled: (r: unknown, b: unknown) => void
      ) => {
        for (const request of requests) {
          onSettled(request, {
            fetchedAt: 0,
            orders: [
              {
                order_id: 1,
                is_buy_order: true,
                location_id: DEFAULT_TRADE_HUB.stationId,
                system_id: DEFAULT_TRADE_HUB.systemId,
                price: 100_000,
                volume_remain: 3,
                range: 'station',
              },
            ],
          });
        }
        return Promise.resolve();
      }
    );
    const { result } = renderHook(() => useSpendPlan(args));
    expect(result.current.open).toBe(false);
    expect(result.current.plan.status).toBe('idle');
    expect(loadLiveBooks).not.toHaveBeenCalled();

    act(() => result.current.run());
    await waitFor(() => expect(result.current.plan.status).toBe('ready'));
    expect(loadLiveBooks).toHaveBeenCalledTimes(1);
    const view = result.current.plan.data!;
    expect(view.walletBalance).toBe(5_000_000);
    expect(view.result.rows).toEqual([expect.objectContaining({ offerId: 1, redemptions: 3 })]);

    act(() => result.current.close());
    expect(result.current.open).toBe(false);
  });
});
