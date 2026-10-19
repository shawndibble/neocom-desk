/**
 * Everything a Build Plan is priced against beyond the plan itself, its
 * market snapshot, the catalog and the Character's own blueprints/modifiers:
 * the assumed-ME and include-blueprint-cost settings, the Character's standing
 * toward every Trade Hub (issue #1238), its corp's blueprints (issue #839) and
 * BPC Sourcing's public-contract rows (issue #838).
 *
 * One module owns all of them so every pricing surface — a plan's own page,
 * Build Plan Compare, the Industry index and every Group Rollup — reads the
 * same values from the same place (Build Opportunities reads only
 * `assumedMe`, #2055). Adding a pricing input means changing this module and
 * `resolveBuildPlan`, not every surface.
 *
 * Call `useBuildPlanPricingInputs` once per page, above whatever remount
 * boundary switches the open Build Plan (the same rule `useCorpOwnedBlueprints`
 * states), and hand the result down; `useIndustryWorkspace` does this.
 *
 * The two settings hydrate asynchronously. `isPricingReady` is the "don't
 * price until hydrated" gate: batch pricing waits on it rather than pricing
 * once at the default and again once hydrated. The plan page and Build
 * Opportunities wait on it too (#2054), just by not mounting until it clears
 * rather than by reading `isPricingReady` themselves — see their own callers.
 */
import { useMemo } from 'react';
import { loadBpcOfferRows } from '@/features/bpcContracts/bpcOfferRows';
import { isSyncConfigured } from '@/app/syncStatus';
import {
  effectivePrice,
  type BpcContractRow,
  type BpcSearchRow,
} from '@/engine/contracts/bpcSearch';
import { useCommunityBlueprintOffers } from '@/features/bpcContracts/useCommunityBlueprintOffers';
import type { BpcOffer } from '@/engine/industry/blueprintAcquisition';
import type { TradeHub } from '@/market/hubs';
import {
  tradeHubStanding,
  useTradeHubStandings,
  type TradeHubStandingsMap,
} from '@/features/market/useTradeHubStandings';
import { useWarmLoad } from '@/lib/useWarmLoad';
import { useAssumedMe } from './assumedMe';
import { useCorpOwnedBlueprints, type CorpOwnedBlueprintsState } from './corpOwnedBlueprints';
import type { BuildPlanSources, CorpBlueprintSource } from './resolveBuildPlan';
import { useHydratedStore } from '@/lib/useHydratedStore';

export interface BuildPlanPricingInputs {
  /** The settings below have hydrated. Until then they read their defaults. */
  hydrated: boolean;
  /** ME to quote an unowned sub-build at (`assumedMe.ts`). */
  assumedMe: number;
  /** The active Character's corp blueprints, folded into a plan on its own `includeCorpAssets`. */
  corpBlueprints: CorpOwnedBlueprintsState;
  /** The Character's standing toward each Trade Hub's NPC owner, keyed by hub id. */
  standings: TradeHubStandingsMap;
  /** BPC Sourcing's public-contract rows, every region; empty until loaded or when not synced. */
  bpcRows: readonly BpcContractRow[];
  /** Community Offers (issue #3603): Shared Blueprints from the Character's Communities; empty until loaded or with none. */
  communityRows: readonly BpcSearchRow[];
}

/** The part of `BuildPlanSources` this module supplies for one plan. */
export type HubPricingSources = Pick<
  BuildPlanSources,
  | 'assumedMe'
  | 'corpBlueprints'
  | 'standing'
  | 'bpcOffersFor'
  | 'bpcLastResortOffersFor'
  | 'communityOffersFor'
>;

/** What `pricingSourcesForHub` reads. Corp blueprints may be withheld, which reads as unavailable. */
export type HubPricingSourceArgs = Pick<
  BuildPlanPricingInputs,
  'assumedMe' | 'standings' | 'bpcRows' | 'communityRows'
> & { corpBlueprints?: CorpBlueprintSource };

const NO_BPC_ROWS: readonly BpcContractRow[] = [];

/**
 * Public-contract offers for one blueprint type, in one region (or, with
 * `outside`, every region but it) — the per-node lookups
 * `acquisitionForLookup` reads. Copies and originals alike; never an auction
 * (its price is a bid, not an ask anyone can pay) or a contract asking for
 * PLEX in exchange. No offers (BPC Sourcing not synced, or nothing listed)
 * leaves `selectBlueprintTier` to its other sources.
 */
export function offersForRegion(
  bpcRows: readonly BpcContractRow[],
  regionId: number,
  outside = false
): (blueprintTypeID: number) => readonly BpcOffer[] {
  const byType = new Map<number, BpcOffer[]>();
  for (const row of bpcRows) {
    if ((row.regionId === regionId) === outside) continue;
    if (row.isAuction || row.requestedPlex) continue;
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
export async function loadBpcContractRows(): Promise<readonly BpcContractRow[] | null> {
  // Originals ride beside the copies (`runs: -1`), so automatic selection
  // can price a blueprint only ever listed as an original.
  return loadBpcOfferRows();
}

/** A missing snapshot rejects, which `useWarmLoad` reads as "keep what is showing". */
async function loadBpcContractRowsOrKeep(): Promise<readonly BpcContractRow[]> {
  const rows = await loadBpcContractRows();
  if (!rows) throw new Error('no BPC contract snapshot');
  return rows;
}

function useBpcContractRows(characterId: number | null): readonly BpcContractRow[] {
  return useWarmLoad('bpcContractRows', characterId, loadBpcContractRowsOrKeep, NO_BPC_ROWS);
}

/** Hydrates and reads every Build Plan pricing input for one Character. */
export function useBuildPlanPricingInputs(characterId: number | null): BuildPlanPricingInputs {
  const assumedMe = useAssumedMe((state) => state.value);
  const assumedMeHydrated = useHydratedStore(useAssumedMe);

  const corpBlueprints = useCorpOwnedBlueprints();
  const standings = useTradeHubStandings(characterId);
  const bpcRows = useBpcContractRows(characterId);
  const { rows: communityRows } = useCommunityBlueprintOffers({
    characterId,
    enabled: isSyncConfigured(),
  });
  const hydrated = assumedMeHydrated;

  // One object per distinct state: every surface's pricing memo keys on it.
  return useMemo(
    () => ({
      hydrated,
      assumedMe,
      corpBlueprints,
      standings,
      bpcRows,
      communityRows,
    }),
    [hydrated, assumedMe, corpBlueprints, standings, bpcRows, communityRows]
  );
}

/** The hydration gate: true once the settings have hydrated. */
export function isPricingReady(inputs: Pick<BuildPlanPricingInputs, 'hydrated'>): boolean {
  return inputs.hydrated;
}

// Per rows array, per region: the same lookup back for the same inputs, so a
// memo keyed on `bpcOffersFor` only re-runs when the offers actually change.
const offersCache = new WeakMap<
  readonly BpcContractRow[],
  Map<string, HubPricingSources['bpcOffersFor']>
>();

function offersFor(
  bpcRows: readonly BpcContractRow[],
  regionId: number,
  outside = false
): (blueprintTypeID: number) => readonly BpcOffer[] {
  let byRegion = offersCache.get(bpcRows);
  if (!byRegion) {
    byRegion = new Map();
    offersCache.set(bpcRows, byRegion);
  }
  const key = `${outside ? '!' : ''}${regionId}`;
  let lookup = byRegion.get(key);
  if (!lookup) {
    lookup = offersForRegion(bpcRows, regionId, outside);
    byRegion.set(key, lookup);
  }
  return lookup;
}

const communityOffersCache = new WeakMap<
  readonly BpcSearchRow[],
  NonNullable<HubPricingSources['communityOffersFor']>
>();

/**
 * Community Offers per blueprint type, free (0 ISK) and named for the Member.
 * Region-agnostic: a Member's station carries no region id. Cached per rows
 * array so a memo keyed on the lookup only re-runs when the offers change.
 */
export function communityOffersForRows(
  rows: readonly BpcSearchRow[]
): NonNullable<HubPricingSources['communityOffersFor']> {
  const cached = communityOffersCache.get(rows);
  if (cached) return cached;
  const byType = new Map<number, BpcOffer[]>();
  for (const row of rows) {
    if (row.source !== 'community') continue;
    const list = byType.get(row.typeId) ?? [];
    list.push({
      me: row.me,
      te: row.te,
      runs: row.runs,
      quantity: row.quantity,
      price: 0,
      community: { memberName: row.memberName, stale: row.stale },
    });
    byType.set(row.typeId, list);
  }
  const lookup = (blueprintTypeID: number) => byType.get(blueprintTypeID) ?? [];
  communityOffersCache.set(rows, lookup);
  return lookup;
}

/** One plan's share of the pricing inputs, for the plan's own Trade Hub. */
export function pricingSourcesForHub(
  inputs: HubPricingSourceArgs,
  hub: TradeHub
): HubPricingSources {
  return {
    assumedMe: inputs.assumedMe,
    corpBlueprints: inputs.corpBlueprints,
    standing: tradeHubStanding(inputs.standings, hub.id),
    bpcOffersFor: offersFor(inputs.bpcRows, hub.regionId),
    bpcLastResortOffersFor: offersFor(inputs.bpcRows, hub.regionId, true),
    communityOffersFor: communityOffersForRows(inputs.communityRows),
  };
}
