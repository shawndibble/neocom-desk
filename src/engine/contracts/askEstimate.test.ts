import { describe, expect, it } from 'vitest';
import type { PublicContractOfferRow } from './contractOffers';
import {
  askEstimateCandidateTypeIds,
  contractAskEstimates,
  summarizeAskEstimates,
  MIN_ASK_ESTIMATE_CONTRACTS,
} from './askEstimate';

const NOW = 1_000_000;
let nextId = 1;
function offer(over: Partial<PublicContractOfferRow> = {}): PublicContractOfferRow {
  return {
    contractId: nextId++,
    regionId: 1,
    locationId: 1,
    typeId: 11567,
    price: 100,
    isAuction: false,
    quantity: 1,
    lineCount: 1,
    dateExpired: NOW + 1000,
    ...over,
  };
}
const many = (prices: number[], over: Partial<PublicContractOfferRow> = {}) =>
  prices.map((price) => offer({ price, ...over }));

describe('contractAskEstimates', () => {
  it('takes the median of clean single-item asks and reports how many', () => {
    const result = contractAskEstimates(many([10, 20, 30, 40, 1000]), NOW);
    expect(result.get(11567)).toEqual({ typeId: 11567, unitPrice: 30, contracts: 5 });
  });

  it('needs at least five clean contracts', () => {
    expect(MIN_ASK_ESTIMATE_CONTRACTS).toBe(5);
    expect(contractAskEstimates(many([10, 20, 30, 40]), NOW).size).toBe(0);
  });

  it('divides a stack ask by its quantity', () => {
    const rows = many([100, 100, 100, 100, 100], { quantity: 2 });
    expect(contractAskEstimates(rows, NOW).get(11567)?.unitPrice).toBe(50);
  });

  it('leaves out zero-price, item-swap, PLEX, bundle, expired, copy, blueprint and bid-only asks', () => {
    const bad = [
      ...many([0, 0]),
      ...many([5], { requestsItems: true }),
      ...many([5], { requestedPlex: 100 }),
      ...many([5], { lineCount: 3 }),
      ...many([5], { lineCount: undefined }),
      ...many([5], { dateExpired: NOW - 1 }),
      ...many([5], { isBlueprintCopy: true }),
      ...many([5], { me: 0, te: 0 }),
      ...many([5], { isAuction: true }),
    ];
    expect(contractAskEstimates([...bad, ...many([10, 20, 30, 40])], NOW).size).toBe(0);
  });

  it('uses an auction buyout as its ask', () => {
    const rows = many([1, 1, 1, 1, 1], { isAuction: true, buyout: 70 });
    expect(contractAskEstimates(rows, NOW).get(11567)?.unitPrice).toBe(70);
  });

  it('keeps types apart', () => {
    const rows = [...many([1, 2, 3, 4, 5]), ...many([9, 9, 9, 9], { typeId: 2 })];
    expect([...contractAskEstimates(rows, NOW).keys()]).toEqual([11567]);
  });
});

describe('askEstimateCandidateTypeIds', () => {
  it('names the unpriced, non-copy, non-abyssal types once each', () => {
    const assets = [
      { type_id: 1, is_blueprint_copy: false },
      { type_id: 1 },
      { type_id: 2 },
      { type_id: 3 },
      { type_id: 4, is_blueprint_copy: true },
      { type_id: 5 },
    ];
    const prices = new Map([
      [2, 50],
      [5, 0],
    ]);
    expect(askEstimateCandidateTypeIds(assets, prices, (id) => id === 3)).toEqual([1, 5]);
  });
});

describe('summarizeAskEstimates', () => {
  it('counts and sums estimated stacks, skipping items valued on their own', () => {
    const estimates = new Map([[1, { typeId: 1, unitPrice: 100, contracts: 6 }]]);
    const assets = [
      { item_id: 1, type_id: 1, quantity: 2 },
      { item_id: 2, type_id: 1, quantity: 1 },
      { item_id: 3, type_id: 9, quantity: 5 },
    ];
    expect(summarizeAskEstimates(assets, estimates, new Map([[2, 5]]))).toEqual({
      stacks: 1,
      value: 200,
    });
  });
});
