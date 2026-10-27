/** The Market-Wide Build Opportunities panel's filter: its shape, URL codec and pure predicates. */
import { BLUEPRINT_SOURCES, type BlueprintSource } from '@/engine/industry/blueprintObtainability';
import {
  PRODUCT_CATEGORIES,
  PRODUCT_TIERS,
  type ProductCategory,
  type ProductTier,
} from '@/engine/industry/marketWideFilters';
import { isRarelySold } from '@/engine/industry/marketWideSanity';
import { boolParam, defineUrlFilter, enumParam, enumSetParam } from '@/lib/urlState';
import { DEFAULT_SALES_SHARE, SALES_SHARE_OPTIONS } from './salesSharePref';

/** "Max build cost" presets — a budget cap, applied to the ranked rows since cost is only known once priced. */
export const BUILD_COST_CAPS = ['any', '10m', '100m', '1b', '10b'] as const;
export type BuildCostCap = (typeof BUILD_COST_CAPS)[number];
export const BUILD_COST_CAP_ISK: Record<BuildCostCap, number | null> = {
  any: null,
  '10m': 10_000_000,
  '100m': 100_000_000,
  '1b': 1_000_000_000,
  '10b': 10_000_000_000,
};

export interface MarketWideFilterState {
  tiers: ReadonlySet<ProductTier>;
  categories: ReadonlySet<ProductCategory>;
  sources: ReadonlySet<BlueprintSource>;
  maxBuildCost: BuildCostCap;
  /** Hides rows no Character on the account has the skills to build. */
  hideSkillGated: boolean;
  /** Hides products selling fewer than `RARELY_SOLD_PER_DAY` a day in the scanned hub's region. */
  hideRarelySold: boolean;
  /** The percent of daily sales ISK/day assumes the pilot sells, as `SALES_SHARE_OPTIONS` text. */
  salesShare: string;
}

export const MARKET_WIDE_FILTER = defineUrlFilter<MarketWideFilterState>({
  tiers: { key: 'marketWide.tiers', codec: enumSetParam(PRODUCT_TIERS) },
  categories: { key: 'marketWide.categories', codec: enumSetParam(PRODUCT_CATEGORIES) },
  sources: { key: 'marketWide.sources', codec: enumSetParam(BLUEPRINT_SOURCES) },
  maxBuildCost: { key: 'marketWide.maxCost', codec: enumParam(BUILD_COST_CAPS, 'any') },
  // The key the standalone chip used, so links saved before the move still apply.
  hideSkillGated: { key: 'marketWide.hideGated', codec: boolParam() },
  hideRarelySold: { key: 'marketWide.hideRare', codec: boolParam() },
  salesShare: {
    key: 'marketWide.share',
    codec: enumParam(SALES_SHARE_OPTIONS, DEFAULT_SALES_SHARE),
  },
});

export function activeFilterCount(filter: MarketWideFilterState): number {
  return [
    filter.tiers.size !== PRODUCT_TIERS.length,
    filter.categories.size !== PRODUCT_CATEGORIES.length,
    filter.sources.size !== BLUEPRINT_SOURCES.length,
    filter.maxBuildCost !== 'any',
    filter.hideSkillGated,
    filter.hideRarelySold,
    filter.salesShare !== DEFAULT_SALES_SHARE,
  ].filter(Boolean).length;
}

/** Only a product whose sales were read and fall short is hidden; an unreadable one stays. */
export function isKnownRarelySold(unitsPerDay: number | null | undefined): boolean {
  return unitsPerDay !== null && unitsPerDay !== undefined && isRarelySold(unitsPerDay);
}

export function sameMembers<V>(a: ReadonlySet<V>, b: ReadonlySet<V>): boolean {
  return a.size === b.size && [...a].every((member) => b.has(member));
}
