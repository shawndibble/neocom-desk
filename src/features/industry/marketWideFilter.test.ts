import { describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import { BLUEPRINT_SOURCES } from '@/engine/industry/blueprintObtainability';
import { PRODUCT_CATEGORIES, PRODUCT_TIERS } from '@/engine/industry/marketWideFilters';
import { formatIskCompact } from '@/lib/isk';
import { activeMarketWideFilters, type MarketWideFilterState } from './marketWideFilter';
import { DEFAULT_SALES_SHARE } from './salesSharePref';

const DEFAULT: MarketWideFilterState = {
  tiers: new Set(PRODUCT_TIERS),
  categories: new Set(PRODUCT_CATEGORIES),
  sources: new Set(BLUEPRINT_SOURCES),
  maxBuildCost: 'any',
  hideSkillGated: false,
  hideRarelySold: false,
  salesShare: DEFAULT_SALES_SHARE,
};

describe('activeMarketWideFilters', () => {
  const pills = (over: Partial<MarketWideFilterState>) =>
    activeMarketWideFilters({ ...DEFAULT, ...over }, i18n.t).map(({ label, value }) => [
      label,
      value,
    ]);

  it('is empty at the defaults', () => {
    expect(pills({})).toEqual([]);
  });

  it('names each filter set, the budget first', () => {
    expect(
      pills({
        tiers: new Set(['tech2']),
        categories: new Set(['ships', 'modules', 'rigs']),
        sources: new Set(['market', 'contract']),
        maxBuildCost: '100m',
        salesShare: '25',
        hideSkillGated: true,
        hideRarelySold: true,
      })
    ).toEqual([
      ['Max build cost', `≤ ${formatIskCompact(100_000_000)}`],
      ['Tier', 'Tech II'],
      ['Category', 'Ships, Modules +1'],
      ['Blueprint', 'NPC market, Contract'],
      ['Share of daily sales', '25%'],
      ['Hide skill-gated', undefined],
      ['Hide rarely sold (under 5/day)', undefined],
    ]);
  });

  it('reads an empty pick as None', () => {
    expect(pills({ tiers: new Set() })).toEqual([['Tier', 'None']]);
  });

  it('each clear restores just its own default', () => {
    const filter: MarketWideFilterState = {
      tiers: new Set(['tech1']),
      categories: new Set(['ships']),
      sources: new Set(['owned']),
      maxBuildCost: '1b',
      hideSkillGated: true,
      hideRarelySold: true,
      salesShare: '50',
    };
    const active = activeMarketWideFilters(filter, i18n.t);
    expect(active).toHaveLength(7);
    for (const pill of active) {
      const cleared = pill.clear(filter);
      // One filter back at its default leaves every other pill standing.
      expect(activeMarketWideFilters(cleared, i18n.t).map((p) => p.label)).toEqual(
        active.filter((p) => p !== pill).map((p) => p.label)
      );
    }
    const [cost, tier, category, source, share, gated, rare] = active;
    expect(cost!.clear(filter).maxBuildCost).toBe('any');
    expect(tier!.clear(filter).tiers).toEqual(DEFAULT.tiers);
    expect(category!.clear(filter).categories).toEqual(DEFAULT.categories);
    expect(source!.clear(filter).sources).toEqual(DEFAULT.sources);
    expect(share!.clear(filter).salesShare).toBe(DEFAULT_SALES_SHARE);
    expect(gated!.clear(filter).hideSkillGated).toBe(false);
    expect(rare!.clear(filter).hideRarelySold).toBe(false);
  });
});
