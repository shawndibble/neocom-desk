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
 * Blueprint Acquisition (issue #838/#839) mirrors `BuildPlanDetail.tsx`'s own
 * wiring: a top-level acquisition resolution overrides the ME/TE this plan is
 * priced at (same as the detail page's `resolvedMe`/`resolvedTe`), and the
 * same `acquisitionFor` closure is forwarded into `computeBuildPlan` so a
 * nested buildable node's own blueprint cost is resolved too — otherwise this
 * hook's totals (the Industry index's Profit column, and every Build Group
 * rollup, both price through this hook) would silently disagree with the
 * plan's own page. `useIncludeBlueprintCost` degrades that cost to zero
 * everywhere at once (tier still resolves, so material quantities never
 * change) rather than reverting to the pre-#838 ME-only heuristic.
 */
import { useEffect, useRef, useState } from 'react';
import i18n from '@/i18n';
import type { BuildPlanRecord } from '@/db';
import { MAX_JOB_RUNS, industryActivityOf } from '@/engine/industry/types';
import type { BuildResult, IndustryBlueprint, SkillLevels } from '@/engine/industry/types';
import type { BpcOffer } from '@/engine/industry/blueprintAcquisition';
import { effectivePrice, type BpcContractRow } from '@/engine/contracts/bpcSearch';
import type { CharacterBlueprint } from '@/esi/endpoints';
import type { PiData } from '@/sde/types';
import { DEFAULT_TRADE_HUB, getTradeHub, type TradeHub } from '@/market/hubs';
import { loadPublicBpcContracts } from '@/features/bpcContracts/syncedContracts';
import { toIndustryBlueprint, type BlueprintCatalog } from './blueprintCatalog';
import { computeBuildPlan } from './computeBuildPlan';
import { loadMarketSnapshots, type MarketSnapshot, type MarketSnapshotRequest } from './marketData';
import { materialPricesFor } from './priceBasis';
import {
  acquisitionForLookup,
  buildPlanTypeIds,
  recipeForLookup,
  withoutAcquisitionCost,
} from './recipes';
import { facilityContextFor } from './planFacilityContext';
import { useAssumedMe } from './assumedMe';
import { useIncludeBlueprintCost } from './includeBlueprintCost';

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
  skills: SkillLevels;
  /** @see ComparedBuildRow.groupResult */
  computeGroupResult?: boolean;
}

/** A plan resolved far enough to ask for prices — what a snapshot request needs. */
interface PriceablePlan {
  blueprint: IndustryBlueprint;
  request: MarketSnapshotRequest;
}

/** A priceable plan paired with the in-flight snapshot that prices it. */
interface PricedPlan {
  blueprint: IndustryBlueprint;
  snapshot: Promise<MarketSnapshot>;
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
 * Resolves what a plan needs priced, before any fetch — the type ids have to
 * be known up front for `loadMarketSnapshots` to union them across a hub.
 */
function priceablePlan(
  plan: BuildPlanRecord,
  catalog: BlueprintCatalog,
  pi: PiData | null
): PriceablePlan | null {
  const entry = catalog.byBlueprintTypeID.get(plan.blueprintTypeID);
  if (!entry) return null;

  const blueprint = toIndustryBlueprint(entry.blueprint);
  return {
    blueprint,
    request: {
      hub: getTradeHub(plan.hubId) ?? DEFAULT_TRADE_HUB,
      typeIds: buildPlanTypeIds(blueprint, { catalog, pi }),
      costIndexSystemId: plan.buildSystemId,
      activity: industryActivityOf(blueprint),
    },
  };
}

function clampInt(value: number, min: number, max: number): number {
  const n = Math.round(value);
  return Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));
}

/** BPC Sourcing offers for one blueprint type, in one region — `bpcRows` narrowed the same way `useBpcAcquisitionOffers` narrows for a single plan's own page. */
function offersForRegion(
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
    });
    byType.set(row.typeId, list);
  }
  return (blueprintTypeID) => byType.get(blueprintTypeID) ?? [];
}

/**
 * Prices one plan against the snapshot already requested for it. Batching
 * happens a level up, so this only ever awaits — a plan with no blueprint has
 * no snapshot to await, and reports that instead.
 */
async function computeRow(
  plan: BuildPlanRecord,
  catalog: BlueprintCatalog,
  pi: PiData | null,
  priced: PricedPlan | null,
  ownedBlueprints: readonly CharacterBlueprint[],
  skills: SkillLevels,
  assumedMe: number,
  bpcRows: readonly BpcContractRow[],
  includeBlueprintCost: boolean,
  computeGroupResult: boolean
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
    const snap = await priced.snapshot;
    const materialPrices = materialPricesFor(snap, plan.materialPriceBasis);
    const hub: TradeHub = getTradeHub(plan.hubId) ?? DEFAULT_TRADE_HUB;

    // Shared by both computeBuildPlan calls below, matching BuildPlanDetail.tsx's
    // own recipeFor/acquisitionFor, so a buildHere choice and a Blueprint
    // Acquisition tier roll up the same way here as they do on the plan's own
    // page.
    const recipeSources = {
      catalog,
      pi,
      ownedBlueprints,
      assumedMeForUnowned: assumedMe,
      blueprintAcquisition: {
        offersFor: offersForRegion(bpcRows, hub.regionId),
        hubPrices: snap.hubPrices,
        sourcing: plan.materialSourcing,
      },
    };
    const recipeFor = recipeForLookup(recipeSources);
    const rawAcquisitionFor = acquisitionForLookup(recipeSources);
    const acquisitionFor = includeBlueprintCost
      ? rawAcquisitionFor
      : withoutAcquisitionCost(rawAcquisitionFor);

    const common = {
      blueprint: priced.blueprint,
      systemCostIndex: snap.systemCostIndex ?? 0,
      adjustedPrices: snap.adjustedPrices ?? {},
      hubPrices: snap.hubPrices,
      materialPrices,
      skills,
      recipeFor,
      acquisitionFor,
    };

    // Top-level Blueprint Acquisition (issue #838), mirroring
    // `BuildPlanDetail.tsx`'s `topLevelAcquisition`/`resolvedMe`/`resolvedTe`:
    // gated on real prices having landed, same as that page's
    // `makeOrBuyContext` — resolving a tier against a zeroed snapshot would
    // disagree with the detail page once prices actually arrive.
    const adjustedPrices = snap.adjustedPrices;
    const systemCostIndex = snap.systemCostIndex;
    const product = priced.blueprint.products[0];
    const topLevelAcquisition =
      product && adjustedPrices !== null && systemCostIndex !== null
        ? acquisitionFor(
            product.typeID,
            clampInt(plan.runs, 1, MAX_JOB_RUNS),
            { ...facilityContextFor(plan), systemCostIndex, adjustedPrices, skills },
            materialPrices
          )
        : null;
    const resolvedMe = topLevelAcquisition?.me ?? plan.me;
    const resolvedTe = topLevelAcquisition?.te ?? plan.te;
    const blueprintAcquisition = topLevelAcquisition
      ? { blueprintTypeID: topLevelAcquisition.blueprintTypeID, line: topLevelAcquisition.line }
      : undefined;

    const planForCompute = { ...plan, me: resolvedMe, te: resolvedTe };
    const { result, error } = computeBuildPlan({
      plan: planForCompute,
      ...common,
      blueprintAcquisition,
    });
    // Same snapshot, priced a second time with owned-stock deduction
    // disabled — the Group Owned Overlay (issue #697) needs each member's
    // tree re-resolved this way; a member's own row above is untouched. Its
    // own error surfaces on the row too (only reachable when the primary
    // call above succeeded, since `error` already wins otherwise) — a member
    // whose group computation alone failed must not silently vanish from the
    // rollup with no explanation, the same "report your own row" contract
    // every other failure mode here keeps.
    let groupResult: BuildResult | null = null;
    let groupError: string | null = null;
    if (computeGroupResult) {
      ({ result: groupResult, error: groupError } = computeBuildPlan({
        plan: planForCompute,
        ...common,
        blueprintAcquisition,
        ignoreOwnedStock: true,
      }));
    }
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
  skills,
  computeGroupResult = false,
}: UseComparedBuildResultsArgs): ComparedBuildRow[] {
  const [rows, setRows] = useState<ComparedBuildRow[]>([]);

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

    // Every plan's request goes in together, so plans sharing a hub share a
    // fetch. Plans with no blueprint contribute none; the returned promises
    // are zipped back onto the requests that produced them, so no plan can
    // pick up a sibling's snapshot.
    const priceable = currentPlans.map((plan) => priceablePlan(plan, catalog, pi));
    const requests = priceable.flatMap((p) => (p ? [p.request] : []));
    const snapshots = loadMarketSnapshots(requests);
    const snapshotByRequest = new Map(requests.map((request, i) => [request, snapshots[i]!]));

    for (const [index, plan] of currentPlans.entries()) {
      const entry = priceable[index];
      const priced = entry
        ? { blueprint: entry.blueprint, snapshot: snapshotByRequest.get(entry.request)! }
        : null;
      void computeRow(
        plan,
        catalog,
        pi,
        priced,
        ownedBlueprints,
        skills,
        assumedMe,
        bpcRows,
        includeBlueprintCost,
        computeGroupResult
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
    assumedMe,
    assumedMeHydrated,
    includeBlueprintCost,
    includeBlueprintCostHydrated,
    bpcRows,
    skills,
    computeGroupResult,
  ]);

  return rows;
}
