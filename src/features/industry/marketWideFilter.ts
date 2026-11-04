/** The Market-Wide Build Opportunities panel's filter: its shape, URL codec and pure predicates. */
import type { TFunction } from 'i18next';
import { summarizeFilterValues, type ActiveFilter } from '@/components/ui';
import { BLUEPRINT_SOURCES, type BlueprintSource } from '@/engine/industry/blueprintObtainability';
import {
  PRODUCT_CATEGORIES,
  PRODUCT_TIERS,
  type ProductCategory,
  type ProductTier,
} from '@/engine/industry/marketWideFilters';
import { RARELY_SOLD_PER_DAY, isRarelySold } from '@/engine/industry/marketWideSanity';
import { formatIskCompact } from '@/lib/isk';
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

/** The picked members of a closed set, in the set's own order, as one short pill value. */
function pickedSummary<V extends string>(
  members: readonly V[],
  picked: ReadonlySet<V>,
  labelFor: (member: V) => string,
  t: TFunction
): string {
  const names = members.filter((member) => picked.has(member)).map(labelFor);
  return summarizeFilterValues(names, t);
}

/**
 * The filters set away from their default. The budget leads: it is the one a
 * pilot sets to match their wallet, and it removes the most rows.
 */
export function activeMarketWideFilters(
  filter: MarketWideFilterState,
  t: TFunction
): ActiveFilter<MarketWideFilterState>[] {
  const active: ActiveFilter<MarketWideFilterState>[] = [];
  const cap = BUILD_COST_CAP_ISK[filter.maxBuildCost];
  if (cap !== null)
    active.push({
      label: t('industry.marketOpportunitiesFilters.maxBuildCost'),
      value: t('filters.atMost', { value: formatIskCompact(cap) }),
      clear: (value) => ({ ...value, maxBuildCost: 'any' }),
    });
  if (filter.tiers.size !== PRODUCT_TIERS.length)
    active.push({
      label: t('industry.marketOpportunitiesFilters.tier'),
      value: pickedSummary(
        PRODUCT_TIERS,
        filter.tiers,
        (tier) => t(`industry.marketOpportunitiesFilters.tiers.${tier}`),
        t
      ),
      clear: (value) => ({ ...value, tiers: new Set(PRODUCT_TIERS) }),
    });
  if (filter.categories.size !== PRODUCT_CATEGORIES.length)
    active.push({
      label: t('industry.marketOpportunitiesFilters.category'),
      value: pickedSummary(
        PRODUCT_CATEGORIES,
        filter.categories,
        (category) => t(`industry.marketOpportunitiesFilters.categories.${category}`),
        t
      ),
      clear: (value) => ({ ...value, categories: new Set(PRODUCT_CATEGORIES) }),
    });
  if (filter.sources.size !== BLUEPRINT_SOURCES.length)
    active.push({
      label: t('industry.marketOpportunitiesBlueprintSource'),
      value: pickedSummary(
        BLUEPRINT_SOURCES,
        filter.sources,
        (source) => t(`industry.marketOpportunitiesBlueprintSources.${source}`),
        t
      ),
      clear: (value) => ({ ...value, sources: new Set(BLUEPRINT_SOURCES) }),
    });
  if (filter.salesShare !== DEFAULT_SALES_SHARE)
    active.push({
      label: t('industry.marketOpportunitiesFilters.salesShare'),
      value: t('filters.percent', { value: filter.salesShare }),
      clear: (value) => ({ ...value, salesShare: DEFAULT_SALES_SHARE }),
    });
  if (filter.hideSkillGated)
    active.push({
      label: t('industry.skillGateFilterChip'),
      clear: (value) => ({ ...value, hideSkillGated: false }),
    });
  if (filter.hideRarelySold)
    active.push({
      label: t('industry.marketOpportunitiesFilters.hideRarelySold', {
        limit: RARELY_SOLD_PER_DAY,
      }),
      clear: (value) => ({ ...value, hideRarelySold: false }),
    });
  return active;
}

/** Only a product whose sales were read and fall short is hidden; an unreadable one stays. */
export function isKnownRarelySold(unitsPerDay: number | null | undefined): boolean {
  return unitsPerDay !== null && unitsPerDay !== undefined && isRarelySold(unitsPerDay);
}

export function sameMembers<V>(a: ReadonlySet<V>, b: ReadonlySet<V>): boolean {
  return a.size === b.size && [...a].every((member) => b.has(member));
}
