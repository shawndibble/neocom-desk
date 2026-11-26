import type { BlueprintSource } from './blueprintObtainability';

export type ProductTier = 'tech1' | 'tech2' | 'tech3' | 'faction' | 'special';

export const PRODUCT_TIERS: readonly ProductTier[] = [
  'tech1',
  'tech2',
  'tech3',
  'faction',
  'special',
];

const TIER_BY_META_GROUP: Readonly<Record<number, ProductTier>> = {
  1: 'tech1',
  54: 'tech1',
  2: 'tech2',
  53: 'tech2',
  14: 'tech3',
  4: 'faction',
  52: 'faction',
};

export function productTier(metaGroupId: number | undefined): ProductTier {
  return metaGroupId === undefined ? 'tech1' : (TIER_BY_META_GROUP[metaGroupId] ?? 'special');
}

export type ProductCategory =
  | 'ships'
  | 'modules'
  | 'rigs'
  | 'ammo'
  | 'drones'
  | 'components'
  | 'structures'
  | 'implants'
  | 'other';

export const PRODUCT_CATEGORIES: readonly ProductCategory[] = [
  'ships',
  'modules',
  'rigs',
  'ammo',
  'drones',
  'components',
  'structures',
  'implants',
  'other',
];

const CATEGORY_BY_ROOT_MARKET_GROUP: Readonly<Record<number, ProductCategory>> = {
  4: 'ships',
  9: 'modules',
  955: 'rigs',
  11: 'ammo',
  157: 'drones',
  475: 'components',
  477: 'structures',
  2202: 'structures',
  2203: 'structures',
  24: 'implants',
};

export function productCategory(rootMarketGroupId: number | null): ProductCategory {
  return rootMarketGroupId === null
    ? 'other'
    : (CATEGORY_BY_ROOT_MARKET_GROUP[rootMarketGroupId] ?? 'other');
}

export interface MarketWideFilters {
  tiers: ReadonlySet<ProductTier>;
  categories: ReadonlySet<ProductCategory>;
  sources: ReadonlySet<BlueprintSource>;
}

export function passesMarketWideFilters(
  product: { tier: ProductTier; category: ProductCategory; source: BlueprintSource },
  filters: MarketWideFilters
): boolean {
  return (
    filters.tiers.has(product.tier) &&
    filters.categories.has(product.category) &&
    filters.sources.has(product.source)
  );
}
