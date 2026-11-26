import { useState } from 'react';
import type { BuildPlanRecord } from '@/db';
import { intParam } from '@/lib/urlState';
import { useUrlParam } from '@/lib/useUrlState';
import type { CharacterModifiers } from '@/engine/industry/characterModifiers';
import type { MarketWideTreeMap } from '@/sde/types';
import type { ResolvedStandings } from '@/engine/market/standings';
import type { TradeHub } from '@/market/hubs';
import type { BlueprintCatalog } from './blueprintCatalog';
import type { MarketWideResearch } from './marketWideOpportunities';
import { useMarketWideOpportunities } from './useMarketWideOpportunities';
import { MARKET_WIDE_PAGE_SIZE } from './marketWidePage';
import { sameMembers, type MarketWideFilterState } from './marketWideFilter';

const SHOWN_LIMIT_CODEC = intParam(MARKET_WIDE_PAGE_SIZE, { min: MARKET_WIDE_PAGE_SIZE });

interface UseMarketWideScanArgs {
  hub: TradeHub;
  trees: MarketWideTreeMap | null;
  catalog: BlueprintCatalog | null;
  modifiers: CharacterModifiers;
  standing?: ResolvedStandings;
  characterIds: number[];
  characterId: number | null;
  latestPlan: BuildPlanRecord | null;
  research: MarketWideResearch;
  filter: MarketWideFilterState;
  setFilter: (next: MarketWideFilterState) => void;
  online: boolean;
  startFolded: boolean;
}

export function useMarketWideScan({
  hub,
  trees,
  catalog,
  modifiers,
  standing,
  characterIds,
  characterId,
  latestPlan,
  research,
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
    characterId,
    latestPlan,
    research,
    filters: filter,
  });
  const { hasRun, loading, run } = scanState;
  const [shownLimit, writeShownLimit] = useUrlParam('marketWide.shown', SHOWN_LIMIT_CODEC);
  const setShownLimit = (next: number | ((limit: number) => number)) =>
    writeShownLimit(typeof next === 'function' ? next(shownLimit) : next);
  const [expandedChoice, setExpandedChoice] = useState<boolean | null>(null);
  const expanded = expandedChoice ?? !startFolded;
  const scan = (next: MarketWideFilterState) => {
    setShownLimit(MARKET_WIDE_PAGE_SIZE);
    setExpandedChoice(true);
    run(next);
  };
  const applyFilter = (next: MarketWideFilterState) => {
    setFilter(next);
    setShownLimit(MARKET_WIDE_PAGE_SIZE);
    const rescan =
      !sameMembers(next.tiers, filter.tiers) ||
      !sameMembers(next.categories, filter.categories) ||
      !sameMembers(next.sources, filter.sources);
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
