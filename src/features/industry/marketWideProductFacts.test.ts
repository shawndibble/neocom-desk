import { describe, it, expect, vi } from 'vitest';
import type { MarketWideTreeMap } from '@/sde/types';

vi.mock('@/sde/loadMarketSde', () => ({
  loadVariations: vi.fn(() =>
    Promise.resolve({ types: { 10: { parentTypeId: null, metaGroupId: 2 } }, metaGroups: {} })
  ),
  loadMarketGroups: vi.fn(() =>
    Promise.resolve([
      { id: 4, name: 'Ships', parentId: null, hasTypes: false },
      { id: 400, name: 'Frigates', parentId: 4, hasTypes: false },
      { id: 401, name: 'Assault Frigates', parentId: 400, hasTypes: true },
      { id: 11, name: 'Ammunition & Charges', parentId: null, hasTypes: true },
    ])
  ),
}));

import { loadMarketWideProductFacts } from './marketWideProductFacts';

const tree = (marketGroupID: number | null) => ({
  blueprintTypeID: 1,
  time: 1,
  outputQuantity: 1,
  marketGroupID,
  materials: [],
});

describe('loadMarketWideProductFacts', () => {
  it('reads each product’s tier from its meta group and category from its root Market Group', async () => {
    const trees: MarketWideTreeMap = { 10: tree(401), 20: tree(11), 30: tree(null) };
    const facts = await loadMarketWideProductFacts(trees);
    expect(facts.get(10)).toEqual({ tier: 'tech2', category: 'ships' });
    expect(facts.get(20)).toEqual({ tier: 'tech1', category: 'ammo' });
    expect(facts.get(30)).toEqual({ tier: 'tech1', category: 'other' });
  });
});
