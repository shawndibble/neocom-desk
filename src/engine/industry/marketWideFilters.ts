/**
 * The market-wide scan's product filters: which tech tier and which kind of
 * item a product is, and whether it passes the pilot's chosen filters. Pure —
 * the caller reads each product's meta group (`market/variations.json`) and
 * root Market Group (`market/groups.json`) and hands the ids in.
 */
import type { BlueprintSource } from './blueprintObtainability';

/** How advanced a product is, from its meta group. */
export type ProductTier = 'tech1' | 'tech2' | 'tech3' | 'faction' | 'special';

export const PRODUCT_TIERS: readonly ProductTier[] = [
  'tech1',
  'tech2',
  'tech3',
  'faction',
  'special',
];

/**
 * `variations.json` metaGroups. Structure Tech I/II and Structure Faction
 * (54/53/52) fold into their ship-side tiers. Everything else — Storyline,
 * Officer, Deadspace, Abyssal, Premium, Limited Time, and any meta group CCP
 * adds later — is `special`: blueprints that come from drops, events or LP,
 * never a steady supply.
 */
const TIER_BY_META_GROUP: Readonly<Record<number, ProductTier>> = {
  1: 'tech1',
  54: 'tech1',
  2: 'tech2',
  53: 'tech2',
  14: 'tech3',
  4: 'faction',
  52: 'faction',
};

/** A product with no meta group is a Tech I root (components, capitals, fuel blocks). */
export function productTier(metaGroupId: number | undefined): ProductTier {
  return metaGroupId === undefined ? 'tech1' : (TIER_BY_META_GROUP[metaGroupId] ?? 'special');
}

/** What kind of item a product is, from its root Market Group. */
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

/** Root Market Group ids (`market/groups.json`, `parentId: null`). */
const CATEGORY_BY_ROOT_MARKET_GROUP: Readonly<Record<number, ProductCategory>> = {
  4: 'ships',
  9: 'modules', // Ship Equipment
  955: 'rigs', // Ship and Module Modifications: rigs and subsystems
  11: 'ammo', // Ammunition & Charges
  157: 'drones',
  475: 'components', // Manufacture & Research
  477: 'structures',
  2202: 'structures', // Structure Equipment
  2203: 'structures', // Structure Modifications
  24: 'implants', // Implants & Boosters
};

export function productCategory(rootMarketGroupId: number | null): ProductCategory {
  return rootMarketGroupId === null
    ? 'other'
    : (CATEGORY_BY_ROOT_MARKET_GROUP[rootMarketGroupId] ?? 'other');
}

/** Which tiers, categories and blueprint sources the scan keeps. */
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
