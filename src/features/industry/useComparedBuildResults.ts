/**
 * Computes each compared Build Plan's own BuildResult independently — its own
 * blueprint/ME/TE/facility/hub/market snapshot, never the currently-open
 * plan's snapshot (issue #453). Mirrors `src/features/market/useCompareRows.ts`'s
 * hook shape: a latest-ref for the plans array so an unrelated re-render
 * doesn't restart every fetch, a value-stable key to gate the effect, and a
 * synchronous "loading" placeholder row per plan before any fetch settles.
 *
 * Concurrency is bounded the same way `SkillCompare.tsx` bounds its own
 * per-character fan-out (`ESI_FANOUT_CONCURRENCY`). Each plan is priced
 * independently, so one plan's failure (missing blueprint, or a
 * snapshot/compute error) never drops it from the result — it reports its own
 * row with `error` set instead, same as the acceptance criteria for #453.
 */
import { useEffect, useRef, useState } from 'react';
import i18n from '@/i18n';
import type { BuildPlanRecord } from '@/db';
import type { BuildResult, SkillLevels } from '@/engine/industry/types';
import type { PiData } from '@/sde/types';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import { DEFAULT_TRADE_HUB, getTradeHub } from '@/market/hubs';
import { toIndustryBlueprint, type BlueprintCatalog } from './blueprintCatalog';
import { computeBuildPlan } from './computeBuildPlan';
import { loadMarketSnapshot } from './marketData';
import { recipeInputTypeIds } from './recipes';

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

/** Same material/product/recipe-input type-id widening `BuildPlanDetail.tsx` does before pricing. */
function typeIdsFor(
  blueprint: ReturnType<typeof toIndustryBlueprint>,
  catalog: BlueprintCatalog,
  pi: PiData | null
): number[] {
  const ids = new Set(blueprint.materials.map((m) => m.typeID));
  const product = blueprint.products[0];
  if (product) ids.add(product.typeID);
  for (const id of recipeInputTypeIds([...ids], { catalog, pi })) ids.add(id);
  return [...ids];
}

async function computeRow(
  plan: BuildPlanRecord,
  catalog: BlueprintCatalog,
  pi: PiData | null,
  skills: SkillLevels
): Promise<ComparedBuildRow> {
  const base = {
    planId: plan.id,
    planName: plan.name,
    productName: productNameFor(plan, catalog),
    runs: plan.runs,
    loading: false,
  };

  const entry = catalog.byBlueprintTypeID.get(plan.blueprintTypeID) ?? null;
  if (!entry) {
    return { ...base, result: null, error: i18n.t('industry.blueprintMissing') };
  }

  const blueprint = toIndustryBlueprint(entry.blueprint);
  const hub = getTradeHub(plan.hubId) ?? DEFAULT_TRADE_HUB;

  try {
    const snapshot = await loadMarketSnapshot(hub, typeIdsFor(blueprint, catalog, pi));
    const { result, error } = computeBuildPlan({
      plan,
      blueprint,
      systemCostIndex: snapshot.systemCostIndex ?? 0,
      adjustedPrices: snapshot.adjustedPrices ?? {},
      hubPrices: snapshot.hubPrices,
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

    void mapWithConcurrencyLimit(currentPlans, ESI_FANOUT_CONCURRENCY, async (plan) => {
      const row = await computeRow(plan, catalog, pi, skills);
      if (cancelled) return;
      setRows((prev) => prev.map((r) => (r.planId === plan.id ? row : r)));
    });

    return () => {
      cancelled = true;
    };
  }, [plansKey, catalog, pi, skills]);

  return rows;
}
