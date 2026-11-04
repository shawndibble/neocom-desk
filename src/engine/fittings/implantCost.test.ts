import { describe, expect, it } from 'vitest';
import type { Source } from './implantSources';
import { costPerGain, orderBy, savingBetween } from './implantCost';

const market = (cost: number): Source => ({
  kind: 'market',
  hubId: 'jita',
  atSelectedHub: true,
  price: cost,
  volume: 5,
  cost,
});
const lp = (cost: number | null, blocked = false): Source => ({
  kind: 'lp',
  corporationId: 1,
  corpName: 'Corp',
  offerId: 9,
  iskCost: 0,
  lpCost: 1000,
  quantity: 1,
  lpRate: 1000,
  turnIns: [],
  cost,
  lpShort: blocked ? 500 : 0,
  balanceKnown: true,
  unbuyable: [],
  blocked,
});

describe('savingBetween', () => {
  it('names the cheaper of two priced sources and by how much', () => {
    const a = market(12_400_000);
    const b = lp(9_000_000);
    expect(savingBetween(a, b)).toEqual({ cheaper: b, saving: 3_400_000 });
    expect(savingBetween(b, a)).toEqual({ cheaper: b, saving: 3_400_000 });
  });

  it('says nothing when either side has no price or they tie', () => {
    expect(savingBetween(market(5), lp(null))).toBeNull();
    expect(savingBetween(market(5), lp(5))).toBeNull();
  });
});

describe('costPerGain', () => {
  it('divides the cost by the gain', () => {
    expect(costPerGain(15_000_000, 7.5)).toBe(2_000_000);
  });

  it('is null without a price or a gain', () => {
    expect(costPerGain(null, 5)).toBeNull();
    expect(costPerGain(100, 0)).toBeNull();
    expect(costPerGain(100, -2)).toBeNull();
  });
});

describe('orderBy', () => {
  it('sorts ascending, keeps ties in their order and puts unknowns last', () => {
    const items = [
      { id: 'a', k: 3 },
      { id: 'b', k: null },
      { id: 'c', k: 1 },
      { id: 'd', k: 3 },
    ];
    expect(orderBy(items, (i) => i.k).map((i) => i.id)).toEqual(['c', 'a', 'd', 'b']);
  });
});
