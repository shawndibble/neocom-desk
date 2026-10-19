import { useState } from 'react';
import type { CharacterModifiers } from '@/engine/industry/characterModifiers';
import type { MarketWideTreeMap } from '@/sde/types';
import type { ResolvedStandings } from '@/engine/market/standings';
import type { TradeHub } from '@/market/hubs';
import type { BlueprintCatalog } from './blueprintCatalog';
import { useMarketWideOpportunities } from './useMarketWideOpportunities';
import { MARKET_WIDE_PAGE_SIZE } from './marketWidePage';
import { sameMembers, type MarketWideFilterState } from './marketWideFilter';

interface UseMarketWideScanArgs {
  hub: TradeHub;
  trees: MarketWideTreeMap | null;
  catalog: BlueprintCatalog | null;
  modifiers: CharacterModifiers;
  standing?: ResolvedStandings;
  characterIds: number[];
  filter: MarketWideFilterState;
  setFilter: (next: MarketWideFilterState) => void;
  online: boolean;
  /** The pilot owns blueprints, so the panel starts folded until they choose otherwise. */
  startFolded: boolean;
}

/**
 * The scan lifecycle behind the Market-Wide panel: the opt-in scan itself, the
 * page of the ranking shown, whether the panel is open, and the filter
 * changes that re-scan.
 */
export function useMarketWideScan({
  hub,
  trees,
  catalog,
  modifiers,
  standing,
  characterIds,
  filter,
  setFilter,
  online,
  startFolded,
}: UseMarketWideScanArgs) {
  const scanState = useMarketWideOpportunities({
    hub,
    trees,
    catalog,
    modifiers,
    standing,
    characterIds,
  });
  const { hasRun, loading, run } = scanState;
  // A tier, category or source change re-scans (they apply before the top-N
  // cut); the build-cost cap only narrows the rows already ranked.
  const [shownLimit, setShownLimit] = useState(MARKET_WIDE_PAGE_SIZE);
  // `null` until the pilot opens or folds it: then the default (folded once they own blueprints) holds.
  const [expandedChoice, setExpandedChoice] = useState<boolean | null>(null);
  const expanded = expandedChoice ?? !startFolded;
  const scan = (next: MarketWideFilterState) => {
    setShownLimit(MARKET_WIDE_PAGE_SIZE);
    // A scan the pilot asked for shows its results.
    setExpandedChoice(true);
    run(next);
  };
  const applyFilter = (next: MarketWideFilterState) => {
    setFilter(next);
    // Any narrowing starts the pilot back at the top of the ranking.
    setShownLimit(MARKET_WIDE_PAGE_SIZE);
    const rescan =
      !sameMembers(next.tiers, filter.tiers) ||
      !sameMembers(next.categories, filter.categories) ||
      !sameMembers(next.sources, filter.sources);
    // Mid-scan too: otherwise the scan already running lands with the old filters.
    if ((hasRun || loading) && rescan && online) scan(next);
  };
  return {
    ...scanState,
    shownLimit,
    setShownLimit,
    expanded,
    toggleExpanded: () => setExpandedChoice(!expanded),
    scan,
    applyFilter,
  };
}
