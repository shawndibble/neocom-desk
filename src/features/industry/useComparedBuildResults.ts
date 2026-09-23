/**
 * Computes each compared Build Plan's own BuildResult independently — its own
 * blueprint/ME/TE/facility/hub/market snapshot, never the currently-open
 * plan's snapshot (issue #453). Mirrors `src/features/market/useCompareRows.ts`'s
 * hook shape: a latest-ref for the plans array so an unrelated re-render
 * doesn't restart every fetch, a value-stable key to gate the effect, and a
 * synchronous "loading" placeholder row per plan before any fetch settles.
 *
 * Every plan's prices come out of **one** `loadMarketSnapshots` call, which
 * unions the type ids of plans sharing a hub into a single hub-price lookup
 * (issue #628). A 25-member Build Group is single-hub by construction, so it
 * costs one such lookup rather than 25 — the per-plan loop this replaced
 * bounded concurrency (`ESI_FANOUT_CONCURRENCY`) but not the number of
 * requests.
 *
 * Independence survives the batching: each plan is priced from its own
 * promise, so one plan's failure (missing blueprint, or a snapshot/compute
 * error) never drops it or any sibling from the result — it reports its own
 * row with `error` set instead, same as the acceptance criteria for #453.
 * Plans sharing a hub do share that fetch's outcome, so they fail together
 * when it fails; each still reports its own row.
 *
 * Resolution itself is `resolveBuildPlan`, the same call `BuildPlanDetail.tsx`
 * makes for the open plan — Blueprint Acquisition (issue #838/#839), the
 * per-plan Corp Assets blueprint merge and the Reaction Location (issue #698)
 * are all wired there, once, so this hook's totals (the Industry index's
 * Profit column, Compare, and every Build Group rollup) cannot drift from the
 * plan's own page. This hook only batches the fetches that feed it.
 */
import { useEffect, useRef, useState } from 'react';
import type { CharacterModifiers } from '@/engine/industry/characterModifiers';
import i18n from '@/i18n';
import type { BuildPlanRecord } from '@/db';
import type { BuildResult } from '@/engine/industry/types';
import type { BpcContractRow } from '@/engine/contracts/bpcSearch';
import type { CharacterBlueprint } from '@/esi/endpoints';
import type { PiData } from '@/sde/types';
import { DEFAULT_TRADE_HUB, getTradeHub, type TradeHub } from '@/market/hubs';
import { loadPublicBpcContracts } from '@/features/bpcContracts/syncedContracts';
import {
  tradeHubStanding,
  type TradeHubStandingsMap,
} from '@/features/market/useTradeHubStandings';
import { toIndustryBlueprint, type BlueprintCatalog } from './blueprintCatalog';
import { loadPlanSnapshots, type PlanSnapshots } from './planSnapshots';
import { resolveBuildPlan, type BuildPlanSources } from './resolveBuildPlan';
import type { CorpOwnedBlueprintsState } from './corpOwnedBlueprints';
import { useAssumedMe } from './assumedMe';
import { useIncludeBlueprintCost } from './includeBlueprintCost';
import { offersForRegion } from './useBpcAcquisitionOffers';

export interface ComparedBuildRow {
  planId: string;
  planName: string;
  productName: string;
  runs: number;
  loading: boolean;
  result: BuildResult | null;
  /**
   * The same plan resolved a second time with owned-stock deduction
   * disabled — null unless `computeGroupResult` was requested (issue #697's
   * Group Owned Overlay needs this; nothing else does, so it stays opt-in
   * rather than doubling every caller's compute cost).
   */
  groupResult: BuildResult | null;
  /** Null once resolved successfully; a message when the plan couldn't be priced. */
  error: string | null;
}

export interface UseComparedBuildResultsArgs {
  plans: readonly BuildPlanRecord[];
  /** Null while the blueprint catalog is still loading — nothing to compute yet. */
  catalog: BlueprintCatalog | null;
  pi: PiData | null;
  ownedBlueprints: readonly CharacterBlueprint[];
  /**
   * The active Character's corp blueprints (issue #839), folded into each
   * plan on its own `includeCorpAssets` — never into every plan at once.
   * Omitted reads as unavailable.
   */
  corpOwnedBlueprints?: CorpOwnedBlueprintsState;
  modifiers: CharacterModifiers;
  /**
   * The active Character's standing toward each Trade Hub's NPC owner
   * (issue #1238), keyed by hub id — `useTradeHubStandings`'s result.
   * Absent/no entry for a plan's hub = standings assumed 0, today's
   * behaviour, same as `BuildPlanDetail.tsx`'s own page.
   */
  tradeHubStandings?: TradeHubStandingsMap;
  /** @see ComparedBuildRow.groupResult */
  computeGroupResult?: boolean;
}

function productNameFor(plan: BuildPlanRecord, catalog: BlueprintCatalog): string {
  return catalog.byBlueprintTypeID.get(plan.blueprintTypeID)?.productName ?? plan.name;
}

function placeholderRow(plan: BuildPlanRecord, catalog: BlueprintCatalog): ComparedBuildRow {
  return {
    planId: plan.id,
    planName: plan.name,
    productName: productNameFor(plan, catalog),
    runs: plan.runs,
    loading: true,
    result: null,
    groupResult: null,
    error: null,
  };
}

/**
 * Prices one plan against the snapshot already requested for it. Batching
 * happens a level up, so this only ever awaits — a plan with no blueprint has
 * no snapshot to await, and reports that instead. Everything past the await
 * is `resolveBuildPlan`, the same resolution the plan's own page runs.
 */
async function computeRow(
  plan: BuildPlanRecord,
  catalog: BlueprintCatalog,
  priced: PlanSnapshots | null,
  sources: Omit<BuildPlanSources, 'catalog' | 'bpcOffersFor' | 'standing'>,
  bpcRows: readonly BpcContractRow[],
  computeGroupResult: boolean,
  tradeHubStandings: TradeHubStandingsMap
): Promise<ComparedBuildRow> {
  const base = {
    planId: plan.id,
    planName: plan.name,
    productName: productNameFor(plan, catalog),
    runs: plan.runs,
    loading: false,
  };

  if (!priced) {
    return { ...base, result: null, groupResult: null, error: i18n.t('industry.blueprintMissing') };
  }

  try {
    const snapshot = await priced.snapshot;
    const reactionSnapshot = await priced.reactionSnapshot;
    const hub: TradeHub = getTradeHub(plan.hubId) ?? DEFAULT_TRADE_HUB;
    const { result, error, groupResult, groupError } = resolveBuildPlan(
      plan,
      {
        ...sources,
        catalog,
        bpcOffersFor: offersForRegion(bpcRows, hub.regionId),
        standing: tradeHubStanding(tradeHubStandings, hub.id),
      },
      { snapshot, reactionSystemCostIndex: reactionSnapshot?.systemCostIndex },
      { withGroupResult: computeGroupResult }
    );
    // The group pass's own error surfaces on the row too (only reachable
    // when the primary pass succeeded, since `error` already wins otherwise)
    // — a member whose group computation alone failed must not silently
    // vanish from the rollup with no explanation.
    return { ...base, result, groupResult, error: error ?? groupError };
  } catch (err) {
    return {
      ...base,
      result: null,
      groupResult: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function useComparedBuildResults({
  plans,
  catalog,
  pi,
  ownedBlueprints,
  corpOwnedBlueprints,
  modifiers,
  tradeHubStandings,
  computeGroupResult = false,
}: UseComparedBuildResultsArgs): ComparedBuildRow[] {
  const [rows, setRows] = useState<ComparedBuildRow[]>([]);

  // Only a plan with its own Corp Assets toggle on reads corp blueprints, so
  // the corp list landing must not restart every row's fetch (and flash every
  // Profit cell back to loading) when no plan here would price differently.
  const anyPlanUsesCorp = plans.some((p) => p.includeCorpAssets ?? false);
  const corpForPlans = anyPlanUsesCorp ? corpOwnedBlueprints : undefined;

  // Latest-ref pattern (useCompareRows.ts): a fresh `plans` array reference
  // lands on nearly every render, so the fetch effect below keys on a
  // value-stable signature instead — otherwise an unrelated re-render (e.g. a
  // sibling plan's edit) would restart every fetch in the comparison.
  const plansRef = useRef(plans);
  useEffect(() => {
    plansRef.current = plans;
  });
  const plansKey = plans.map((p) => `${p.id}:${p.updatedAt}`).join(',');

  // Same setting BuildPlanDetail.tsx uses for the open plan — unowned
  // sub-builds must quote at the pilot's assumption, not 0, or profit
  // silently disagrees between views.
  const assumedMe = useAssumedMe((state) => state.value);
  const assumedMeHydrated = useAssumedMe((state) => state.hydrated);
  const hydrateAssumedMe = useAssumedMe((state) => state.hydrate);
  useEffect(() => {
    void hydrateAssumedMe();
  }, [hydrateAssumedMe]);

  const includeBlueprintCost = useIncludeBlueprintCost((state) => state.value);
  const includeBlueprintCostHydrated = useIncludeBlueprintCost((state) => state.hydrated);
  const hydrateIncludeBlueprintCost = useIncludeBlueprintCost((state) => state.hydrate);
  useEffect(() => {
    void hydrateIncludeBlueprintCost();
  }, [hydrateIncludeBlueprintCost]);

  // BPC Sourcing's public-contract snapshot (issue #838), loaded once per
  // active character rather than per plan/region — `loadPublicBpcContracts`
  // is a single shared cache-through read, and `offersForRegion` narrows it
  // per plan below, the same split `useBpcAcquisitionOffers` makes for one
  // plan's own page.
  const characterId = plans[0]?.characterId;
  const [bpcRows, setBpcRows] = useState<readonly BpcContractRow[]>([]);
  useEffect(() => {
    if (characterId === undefined) return;
    let cancelled = false;
    void loadPublicBpcContracts(characterId).then((cached) => {
      if (cancelled || !cached) return;
      setBpcRows(cached.data.rows);
    });
    return () => {
      cancelled = true;
    };
  }, [characterId]);

  useEffect(() => {
    const currentPlans = plansRef.current;
    if (!catalog || currentPlans.length === 0) {
      setRows([]);
      return;
    }
    setRows(currentPlans.map((plan) => placeholderRow(plan, catalog)));
    // Skip fetching until the real assumedMe/includeBlueprintCost settings
    // land, rather than fetching once at the default and again once
    // hydrated — a batched multi-plan fetch is too expensive to double.
    if (!assumedMeHydrated || !includeBlueprintCostHydrated) return;
    let cancelled = false;

    // Every plan's requests go in one call, so plans sharing a hub share a
    // fetch. Plans with no blueprint contribute none.
    const priceable = currentPlans.flatMap((plan) => {
      const entry = catalog.byBlueprintTypeID.get(plan.blueprintTypeID);
      return entry ? [{ plan, blueprint: toIndustryBlueprint(entry.blueprint) }] : [];
    });
    const snapshots = loadPlanSnapshots(priceable, { catalog, pi });
    const pricedByPlanId = new Map(priceable.map(({ plan }, i) => [plan.id, snapshots[i]!]));

    for (const plan of currentPlans) {
      const priced = pricedByPlanId.get(plan.id) ?? null;
      void computeRow(
        plan,
        catalog,
        priced,
        {
          pi,
          ownedBlueprints,
          corpBlueprints: corpForPlans,
          assumedMe,
          modifiers,
          includeBlueprintCost,
        },
        bpcRows,
        computeGroupResult,
        tradeHubStandings ?? new Map()
      ).then((row) => {
        if (cancelled) return;
        setRows((prev) => prev.map((r) => (r.planId === plan.id ? row : r)));
      });
    }

    return () => {
      cancelled = true;
    };
  }, [
    plansKey,
    catalog,
    pi,
    ownedBlueprints,
    corpForPlans,
    assumedMe,
    assumedMeHydrated,
    includeBlueprintCost,
    includeBlueprintCostHydrated,
    bpcRows,
    modifiers,
    tradeHubStandings,
    computeGroupResult,
  ]);

  return rows;
}
