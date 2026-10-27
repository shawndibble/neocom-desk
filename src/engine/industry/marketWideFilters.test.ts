import { describe, it, expect } from 'vitest';
import {
  PRODUCT_CATEGORIES,
  PRODUCT_TIERS,
  passesMarketWideFilters,
  productCategory,
  productTier,
  type MarketWideFilters,
} from './marketWideFilters';

describe('productTier', () => {
  it.each([
    [undefined, 'tech1'],
    [1, 'tech1'],
    [54, 'tech1'], // Structure Tech I
    [2, 'tech2'],
    [53, 'tech2'], // Structure Tech II
    [14, 'tech3'],
    [4, 'faction'],
    [52, 'faction'], // Structure Faction
    [3, 'special'], // Storyline
    [5, 'special'], // Officer
    [6, 'special'], // Deadspace
    [15, 'special'], // Abyssal
    [17, 'special'], // Premium
    [19, 'special'], // Limited Time
    [999, 'special'], // a meta group CCP adds later
  ] as const)('meta group %s is %s', (metaGroupId, tier) => {
    expect(productTier(metaGroupId)).toBe(tier);
  });
});

describe('productCategory', () => {
  it.each([
    [4, 'ships'],
    [9, 'modules'],
    [955, 'rigs'],
    [11, 'ammo'],
    [157, 'drones'],
    [475, 'components'],
    [477, 'structures'],
    [2202, 'structures'], // Structure Equipment
    [2203, 'structures'], // Structure Modifications
    [24, 'implants'],
    [19, 'other'], // Trade Goods
    [null, 'other'],
  ] as const)('root Market Group %s is %s', (rootMarketGroupId, category) => {
    expect(productCategory(rootMarketGroupId)).toBe(category);
  });
});

const ALL: MarketWideFilters = {
  tiers: new Set(PRODUCT_TIERS),
  categories: new Set(PRODUCT_CATEGORIES),
  sources: new Set(['owned', 'market', 'contract', 'lpStore']),
};
const product = { tier: 'tech1', category: 'ships', source: 'market' } as const;

describe('passesMarketWideFilters', () => {
  it('passes everything with every filter on', () => {
    expect(passesMarketWideFilters(product, ALL)).toBe(true);
  });

  it('drops a product whose tier is off', () => {
    expect(passesMarketWideFilters(product, { ...ALL, tiers: new Set(['tech2']) })).toBe(false);
  });

  it('drops a product whose category is off', () => {
    expect(passesMarketWideFilters(product, { ...ALL, categories: new Set(['ammo']) })).toBe(false);
  });

  it('drops a product whose blueprint source is off', () => {
    expect(passesMarketWideFilters(product, { ...ALL, sources: new Set(['owned']) })).toBe(false);
  });
});
