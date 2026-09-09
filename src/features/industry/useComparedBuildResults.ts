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
 */
import { useEffect, useRef, useState } from 'react';
import i18n from '@/i18n';
import type { BuildPlanRecord } from '@/db';
import { industryActivityOf } from '@/engine/industry/types';
import type { BuildResult, IndustryBlueprint, SkillLevels } from '@/engine/industry/types';
import type { PiData } from '@/sde/types';
import { DEFAULT_TRADE_HUB, getTradeHub } from '@/market/hubs';
import { toIndustryBlueprint, type BlueprintCatalog } from './blueprintCatalog';
import { computeBuildPlan } from './computeBuildPlan';
import { loadMarketSnapshots, type MarketSnapshot, type MarketSnapshotRequest } from './marketData';
import { materialPricesFor } from './priceBasis';
import { buildPlanTypeIds } from './recipes';

export interface ComparedBuildRow {
  planId: string;
  planName: string;
  productName: string;
  runs: number;
  loading: boolean;
  result: BuildResult | null;
  /** Null once resolved successfully; a message when the plan couldn't be priced. */
  error: string | null;
}

export interface UseComparedBuildResultsArgs {
  plans: readonly BuildPlanRecord[];
  /** Null while the blueprint catalog is still loading — nothing to compute yet. */
  catalog: BlueprintCatalog | null;
  pi: PiData | null;
  skills: SkillLevels;
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

/**
 * Prices one plan against the snapshot already requested for it. Batching
 * happens a level up, so this only ever awaits — a plan with no blueprint has
 * no snapshot to await, and reports that instead.
 */
async function computeRow(
  plan: BuildPlanRecord,
  catalog: BlueprintCatalog,
  priced: PricedPlan | null,
  skills: SkillLevels
): Promise<ComparedBuildRow> {
  const base = {
    planId: plan.id,
    planName: plan.name,
    productName: productNameFor(plan, catalog),
    runs: plan.runs,
    loading: false,
  };

  if (!priced) {
    return { ...base, result: null, error: i18n.t('industry.blueprintMissing') };
  }

  try {
    const snap = await priced.snapshot;
    const { result, error } = computeBuildPlan({
      plan,
      blueprint: priced.blueprint,
      systemCostIndex: snap.systemCostIndex ?? 0,
      adjustedPrices: snap.adjustedPrices ?? {},
      hubPrices: snap.hubPrices,
      materialPrices: materialPricesFor(snap, plan.materialPriceBasis),
      skills,
    });
    return { ...base, result, error };
  } catch (err) {
    return { ...base, result: null, error: err instanceof Error ? err.message : String(err) };
  }
}

export function useComparedBuildResults({
  plans,
  catalog,
  pi,
  skills,
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

  useEffect(() => {
    const currentPlans = plansRef.current;
    if (!catalog || currentPlans.length === 0) {
      setRows([]);
      return;
    }
    let cancelled = false;
    setRows(currentPlans.map((plan) => placeholderRow(plan, catalog)));

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
      void computeRow(plan, catalog, priced, skills).then((row) => {
        if (cancelled) return;
        setRows((prev) => prev.map((r) => (r.planId === plan.id ? row : r)));
      });
    }

    return () => {
      cancelled = true;
    };
  }, [plansKey, catalog, pi, skills]);

  return rows;
}
