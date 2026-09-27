/**
 * Everything a Build Plan is priced against beyond the plan itself, its
 * market snapshot, the catalog and the Character's own blueprints/modifiers:
 * the assumed-ME and include-blueprint-cost settings, the Character's standing
 * toward every Trade Hub (issue #1238), its corp's blueprints (issue #839) and
 * BPC Sourcing's public-contract rows (issue #838).
 *
 * One module owns all of them so every pricing surface — a plan's own page,
 * Compare, the Industry index and every Group Rollup, and Build Opportunities
 * — reads the same values from the same place. Adding a pricing input means
 * changing this module and `resolveBuildPlan`, not every surface.
 *
 * Call `useBuildPlanPricingInputs` once per page, above whatever remount
 * boundary switches the open Build Plan (the same rule `useCorpOwnedBlueprints`
 * states), and hand the result down; `useIndustryWorkspace` does this.
 *
 * The two settings hydrate asynchronously. `hydratedPricingInputs` is the
 * "don't price until hydrated" gate: batch pricing waits on it rather than
 * pricing once at the default and again once hydrated.
 */
import { useEffect, useMemo, useState } from 'react';
import { loadPublicBpcContracts } from '@/features/bpcContracts/syncedContracts';
import { effectivePrice, type BpcContractRow } from '@/engine/contracts/bpcSearch';
import type { BpcOffer } from '@/engine/industry/blueprintAcquisition';
import type { TradeHub } from '@/market/hubs';
import {
  tradeHubStanding,
  useTradeHubStandings,
  type TradeHubStandingsMap,
} from '@/features/market/useTradeHubStandings';
import { useAssumedMe } from './assumedMe';
import { useIncludeBlueprintCost } from './includeBlueprintCost';
import { useCorpOwnedBlueprints, type CorpOwnedBlueprintsState } from './corpOwnedBlueprints';
import type { BuildPlanSources, CorpBlueprintSource } from './resolveBuildPlan';

export interface BuildPlanPricingInputs {
  /** Both settings below have hydrated. Until then they read their defaults. */
  hydrated: boolean;
  /** ME to quote an unowned sub-build at (`assumedMe.ts`). */
  assumedMe: number;
  /** Whether Blueprint Acquisition's cost counts toward profit (`includeBlueprintCost.ts`). */
  includeBlueprintCost: boolean;
  /** The active Character's corp blueprints, folded into a plan on its own `includeCorpAssets`. */
  corpBlueprints: CorpOwnedBlueprintsState;
  /** The Character's standing toward each Trade Hub's NPC owner, keyed by hub id. */
  standings: TradeHubStandingsMap;
  /** BPC Sourcing's public-contract rows, every region; empty until loaded or when not synced. */
  bpcRows: readonly BpcContractRow[];
}

/** The part of `BuildPlanSources` this module supplies for one plan. */
export type HubPricingSources = Pick<
  BuildPlanSources,
  'assumedMe' | 'includeBlueprintCost' | 'corpBlueprints' | 'standing' | 'bpcOffersFor'
>;

/** What `pricingSourcesForHub` reads. Corp blueprints may be withheld, which reads as unavailable. */
export type PricingSourceInputs = Pick<
  BuildPlanPricingInputs,
  'assumedMe' | 'includeBlueprintCost' | 'standings' | 'bpcRows'
> & { corpBlueprints?: CorpBlueprintSource };

const NO_BPC_ROWS: readonly BpcContractRow[] = [];

/**
 * BPC Sourcing offers for one blueprint type, in one region — the per-node
 * lookup `acquisitionForLookup` reads. No offers (BPC Sourcing not synced, or
 * nothing listed) lets `selectBlueprintTier`'s price cascade fall straight
 * through to the BPO's own hub sell price.
 */
export function offersForRegion(
  bpcRows: readonly BpcContractRow[],
  regionId: number
): (blueprintTypeID: number) => readonly BpcOffer[] {
  const byType = new Map<number, BpcOffer[]>();
  for (const row of bpcRows) {
    if (row.regionId !== regionId) continue;
    const list = byType.get(row.typeId) ?? [];
    list.push({
      me: row.me,
      te: row.te,
      runs: row.runs,
      quantity: row.quantity,
      price: effectivePrice(row),
      isMultiType: row.isMultiType,
    });
    byType.set(row.typeId, list);
  }
  return (blueprintTypeID) => byType.get(blueprintTypeID) ?? [];
}

/**
 * BPC Sourcing's public-contract rows, or null when the snapshot is missing
 * (not synced, not landed yet) or the load failed. A caller that needs the
 * rows right now — Group Auto Build at click time — reads them here rather
 * than off possibly still-empty hook state.
 */
export async function loadBpcContractRows(
  characterId: number
): Promise<readonly BpcContractRow[] | null> {
  try {
    const cached = await loadPublicBpcContracts(characterId);
    return cached?.data.rows ?? null;
  } catch {
    return null;
  }
}

function useBpcContractRows(characterId: number | null): readonly BpcContractRow[] {
  const [rows, setRows] = useState<readonly BpcContractRow[]>(NO_BPC_ROWS);
  useEffect(() => {
    if (characterId === null) return;
    let cancelled = false;
    // Left as-is when there's nothing to replace it with — the same
    // stale-while-loading rule `useTradeHubStandings` states.
    void loadBpcContractRows(characterId).then((loaded) => {
      if (!cancelled && loaded) setRows(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [characterId]);
  return rows;
}

/** Hydrates and reads every Build Plan pricing input for one Character. */
export function useBuildPlanPricingInputs(characterId: number | null): BuildPlanPricingInputs {
  const assumedMe = useAssumedMe((state) => state.value);
  const assumedMeHydrated = useAssumedMe((state) => state.hydrated);
  const hydrateAssumedMe = useAssumedMe((state) => state.hydrate);
  const includeBlueprintCost = useIncludeBlueprintCost((state) => state.value);
  const includeBlueprintCostHydrated = useIncludeBlueprintCost((state) => state.hydrated);
  const hydrateIncludeBlueprintCost = useIncludeBlueprintCost((state) => state.hydrate);
  useEffect(() => {
    void hydrateAssumedMe();
    void hydrateIncludeBlueprintCost();
  }, [hydrateAssumedMe, hydrateIncludeBlueprintCost]);

  const corpBlueprints = useCorpOwnedBlueprints();
  const standings = useTradeHubStandings(characterId);
  const bpcRows = useBpcContractRows(characterId);
  const hydrated = assumedMeHydrated && includeBlueprintCostHydrated;

  // One object per distinct state: every surface's pricing memo keys on it.
  return useMemo(
    () => ({ hydrated, assumedMe, includeBlueprintCost, corpBlueprints, standings, bpcRows }),
    [hydrated, assumedMe, includeBlueprintCost, corpBlueprints, standings, bpcRows]
  );
}

/** The hydration gate: the inputs once both settings have hydrated, else null. */
export function hydratedPricingInputs(
  inputs: BuildPlanPricingInputs
): BuildPlanPricingInputs | null {
  return inputs.hydrated ? inputs : null;
}

// Per rows array, per region: the same lookup back for the same inputs, so a
// memo keyed on `bpcOffersFor` only re-runs when the offers actually change.
const offersCache = new WeakMap<
  readonly BpcContractRow[],
  Map<number, HubPricingSources['bpcOffersFor']>
>();

function offersFor(
  bpcRows: readonly BpcContractRow[],
  regionId: number
): (blueprintTypeID: number) => readonly BpcOffer[] {
  let byRegion = offersCache.get(bpcRows);
  if (!byRegion) {
    byRegion = new Map();
    offersCache.set(bpcRows, byRegion);
  }
  let lookup = byRegion.get(regionId);
  if (!lookup) {
    lookup = offersForRegion(bpcRows, regionId);
    byRegion.set(regionId, lookup);
  }
  return lookup;
}

/** One plan's share of the pricing inputs, for the plan's own Trade Hub. */
export function pricingSourcesForHub(
  inputs: PricingSourceInputs,
  hub: TradeHub
): HubPricingSources {
  return {
    assumedMe: inputs.assumedMe,
    includeBlueprintCost: inputs.includeBlueprintCost,
    corpBlueprints: inputs.corpBlueprints,
    standing: tradeHubStanding(inputs.standings, hub.id),
    bpcOffersFor: offersFor(inputs.bpcRows, hub.regionId),
  };
}
