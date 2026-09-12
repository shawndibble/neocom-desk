import { describe, expect, it } from 'vitest';
import { diffBpcWatchMatches, type BpcWatchState } from './bpcWatch';
import { EMPTY_BPC_SEARCH_FILTER, type BpcContractRow } from './bpcSearch';

function row(overrides: Partial<BpcContractRow>): BpcContractRow {
  return {
    contractId: 1,
    regionId: 10000002,
    locationId: 60003760,
    typeId: 999,
    price: 1_000_000,
    isAuction: false,
    me: 10,
    te: 20,
    runs: 1,
    quantity: 1,
    dateExpired: Date.now() + 86_400_000,
    ...overrides,
  };
}

describe('diffBpcWatchMatches', () => {
  it('fires nothing on the first poll (no prior baseline), and records a baseline', () => {
    const rows = [row({ contractId: 1, price: 5_000_000 })];
    const { fire, nextState } = diffBpcWatchMatches(EMPTY_BPC_SEARCH_FILTER, undefined, rows);
    expect(fire).toBeNull();
    expect(nextState).toEqual<BpcWatchState>({
      seenContractIds: [1],
      minPriceSeen: 5_000_000,
    });
  });

  it('fires "new" for a contract not in the previous baseline', () => {
    const prev: BpcWatchState = { seenContractIds: [1], minPriceSeen: 5_000_000 };
    const rows = [
      row({ contractId: 1, price: 5_000_000 }),
      row({ contractId: 2, price: 6_000_000 }),
    ];
    const { fire, nextState } = diffBpcWatchMatches(EMPTY_BPC_SEARCH_FILTER, prev, rows);
    expect(fire).toEqual({ contractId: 2, typeId: 999, price: 6_000_000, reason: 'new' });
    expect(nextState.seenContractIds).toEqual([1, 2]);
    // The all-time low is unaffected by a new, more expensive offer.
    expect(nextState.minPriceSeen).toBe(5_000_000);
  });

  it('does not re-fire for a contract already in the baseline at the same price', () => {
    const prev: BpcWatchState = { seenContractIds: [1], minPriceSeen: 5_000_000 };
    const rows = [row({ contractId: 1, price: 5_000_000 })];
    const { fire } = diffBpcWatchMatches(EMPTY_BPC_SEARCH_FILTER, prev, rows);
    expect(fire).toBeNull();
  });

  it('fires "cheaper" when the cheapest matching price drops below the all-time low, even for an already-seen contract', () => {
    const prev: BpcWatchState = { seenContractIds: [1], minPriceSeen: 5_000_000 };
    const rows = [row({ contractId: 1, price: 4_000_000 })];
    const { fire, nextState } = diffBpcWatchMatches(EMPTY_BPC_SEARCH_FILTER, prev, rows);
    expect(fire).toEqual({ contractId: 1, typeId: 999, price: 4_000_000, reason: 'cheaper' });
    expect(nextState.minPriceSeen).toBe(4_000_000);
  });

  it('prefers reporting a genuinely new offer over a cheaper-but-already-seen one in the same poll', () => {
    const prev: BpcWatchState = { seenContractIds: [1], minPriceSeen: 5_000_000 };
    const rows = [
      row({ contractId: 1, price: 4_500_000 }), // cheaper than the all-time low, but already seen
      row({ contractId: 2, price: 4_000_000 }), // new and cheaper still
    ];
    const { fire } = diffBpcWatchMatches(EMPTY_BPC_SEARCH_FILTER, prev, rows);
    expect(fire).toEqual({ contractId: 2, typeId: 999, price: 4_000_000, reason: 'new' });
  });

  it('never fires for a row the filter excludes', () => {
    const prev: BpcWatchState = { seenContractIds: [], minPriceSeen: null };
    const rows = [row({ contractId: 1, typeId: 999, price: 5_000_000 })];
    const { fire, nextState } = diffBpcWatchMatches(
      { ...EMPTY_BPC_SEARCH_FILTER, typeIds: new Set([12345]) },
      prev,
      rows
    );
    expect(fire).toBeNull();
    expect(nextState).toEqual<BpcWatchState>({ seenContractIds: [], minPriceSeen: null });
  });

  it('replaces the seen set with only this poll’s matches, not an ever-growing history', () => {
    const prev: BpcWatchState = { seenContractIds: [1, 2], minPriceSeen: 5_000_000 };
    const rows = [row({ contractId: 2, price: 6_000_000 })];
    const { nextState } = diffBpcWatchMatches(EMPTY_BPC_SEARCH_FILTER, prev, rows);
    expect(nextState.seenContractIds).toEqual([2]);
  });

  it('uses effective price (buyout for an auction) for both the cheaper check and the fire', () => {
    const prev: BpcWatchState = { seenContractIds: [1], minPriceSeen: 5_000_000 };
    const rows = [row({ contractId: 1, isAuction: true, price: 1_000_000, buyout: 4_000_000 })];
    const { fire } = diffBpcWatchMatches(EMPTY_BPC_SEARCH_FILTER, prev, rows);
    expect(fire).toEqual({ contractId: 1, typeId: 999, price: 4_000_000, reason: 'cheaper' });
  });
});
