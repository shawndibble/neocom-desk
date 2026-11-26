import { useEffect, useRef, useState } from 'react';
import { depthPriceMap, summedDepthNeeds } from '@/engine/industry/depthPrice';
import type { CharacterModifiers } from '@/engine/industry/characterModifiers';
import i18n from '@/i18n';
import type { BuildPlanRecord } from '@/db';
import type { BuildResult, HubPrices } from '@/engine/industry/types';
import type { CharacterBlueprint } from '@/esi/endpoints';
import type { PiData } from '@/sde/types';
import { DEFAULT_TRADE_HUB, getTradeHub, type TradeHub } from '@/market/hubs';
import { toIndustryBlueprint, type BlueprintCatalog } from './blueprintCatalog';
import { loadDepthPrices, type DepthPrices } from './depthPriceLoader';
import { loadPlanSnapshots, type PlanSnapshots } from './planSnapshots';
import { hubPricesAtPercent } from '@/features/market/hubPricesAtPercent';
import { usePricePercentFor } from '@/features/market/pagePricePercents';
import { createYielder } from './yieldToMain';
import { shoppingListMaterials } from './subBuildPlan';
import { pricePlan } from './planPricing';
import type { BuildPlanSources } from './resolveBuildPlan';
import {
  isPricingReady,
  pricingSourcesForHub,
  type BuildPlanPricingInputs,
  type HubPricingSources,
  type HubPricingSourceArgs,
} from './buildPlanPricingInputs';

export interface ComparedBuildRow {
  planId: string;
  planName: string;
  productName: string;
  runs: number;
  loading: boolean;
  result: BuildResult | null;
  groupResult: BuildResult | null;
  error: string | null;
  depth?: DepthPrices;
}

export interface UseComparedBuildResultsArgs {
  plans: readonly BuildPlanRecord[];
  catalog: BlueprintCatalog | null;
  pi: PiData | null;
  ownedBlueprints: readonly CharacterBlueprint[];
  modifiers: CharacterModifiers;
  pricingInputs: BuildPlanPricingInputs;
  computeGroupResult?: boolean;
  groupDepthPrices?: boolean;
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

async function computeRow(
  plan: BuildPlanRecord,
  catalog: BlueprintCatalog,
  priced: PlanSnapshots | null,
  sources: Omit<BuildPlanSources, 'catalog' | keyof HubPricingSources>,
  pricing: HubPricingSourceArgs,
  computeGroupResult: boolean,
  pricePercent: number,
  depthPrices?: HubPrices
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
    const blueprintPurchaseOffersFor = await priced.blueprintOffers;
    const inventionMarket = await priced.inventionMarket;
    const hub: TradeHub = getTradeHub(plan.hubId) ?? DEFAULT_TRADE_HUB;
    const hubSources = pricingSourcesForHub(pricing, hub);
    const { resolved, basisResult } = await pricePlan(
      plan,
      { ...sources, ...hubSources, blueprintPurchaseOffersFor, inventionMarket, catalog },
      { snapshot, reactionSystemCostIndex: reactionSnapshot?.systemCostIndex, depthPrices },
      {
        depth: depthPrices ? null : loadDepthPrices,
        profitBasis: pricing.profitBasis,
        withGroupResult: computeGroupResult,
        pricePercent,
      }
    );
    const { error, groupResult, groupError } = resolved;
    return { ...base, result: basisResult, groupResult, error: error ?? groupError };
  } catch (err) {
    return {
      ...base,
      result: null,
      groupResult: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

const hubIdOf = (plan: BuildPlanRecord) => (getTradeHub(plan.hubId) ?? DEFAULT_TRADE_HUB).id;

async function groupDepthFor(
  plans: readonly BuildPlanRecord[],
  rows: readonly ComparedBuildRow[],
  pricedByPlanId: ReadonlyMap<string, PlanSnapshots>
): Promise<Map<TradeHub['id'], DepthPrices>> {
  const members = await Promise.all(
    plans.map(async (plan, i) => {
      const resolved = rows[i]?.groupResult ?? rows[i]?.result;
      const priced = pricedByPlanId.get(plan.id);
      if (!resolved || !priced) return null;
      const snapshot = await priced.snapshot.catch(() => null);
      if (!snapshot) return null;
      return {
        hubId: hubIdOf(plan),
        lines: shoppingListMaterials(resolved.materials),
        sellVolumes: snapshot.hubSellVolumes,
        sourcing: plan.materialSourcing,
        basis: plan.materialPriceBasis,
      };
    })
  );
  const needsByHub = summedDepthNeeds(members.filter((m) => m !== null));
  const result = new Map<TradeHub['id'], DepthPrices>();
  await Promise.all(
    [...needsByHub].map(async ([hubId, needs]) => {
      const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;
      const depth = await loadDepthPrices(hub, needs);
      if (depth.size > 0) result.set(hub.id, depth);
    })
  );
  return result;
}

export function useComparedBuildResults({
  plans,
  catalog,
  pi,
  ownedBlueprints,
  modifiers,
  pricingInputs,
  computeGroupResult = false,
  groupDepthPrices = false,
}: UseComparedBuildResultsArgs): ComparedBuildRow[] {
  const [rows, setRows] = useState<ComparedBuildRow[]>([]);

  const anyPlanUsesCorp = plans.some((p) => p.includeCorpAssets ?? false);
  const corpForPlans = anyPlanUsesCorp ? pricingInputs.corpBlueprints : undefined;
  const ready = isPricingReady(pricingInputs);
  const { assumedMe, profitBasis, standings, bpcRows, communityRows } = pricingInputs;

  const plansRef = useRef(plans);
  useEffect(() => {
    plansRef.current = plans;
  });
  const plansKey = plans.map((p) => `${p.id}:${p.updatedAt}:${p.hubId}`).join(',');
  const pricePercent = usePricePercentFor('industry');

  useEffect(() => {
    const currentPlans = plansRef.current;
    if (!catalog || currentPlans.length === 0) {
      setRows([]);
      return;
    }
    setRows(currentPlans.map((plan) => placeholderRow(plan, catalog)));
    if (!ready) return;
    let cancelled = false;

    const priceable = currentPlans.flatMap((plan) => {
      const entry = catalog.byBlueprintTypeID.get(plan.blueprintTypeID);
      return entry ? [{ plan, blueprint: toIndustryBlueprint(entry.blueprint) }] : [];
    });
    const snapshots = loadPlanSnapshots(priceable, { catalog, pi }, pricePercent);
    const pricedByPlanId = new Map(priceable.map(({ plan }, i) => [plan.id, snapshots[i]!]));

    const rowFor = (plan: BuildPlanRecord, depthPrices?: HubPrices) =>
      computeRow(
        plan,
        catalog,
        pricedByPlanId.get(plan.id) ?? null,
        { pi, ownedBlueprints, modifiers },
        {
          assumedMe,
          profitBasis,
          corpBlueprints: corpForPlans,
          standings,
          bpcRows,
          communityRows,
        },
        computeGroupResult,
        pricePercent,
        depthPrices
      );
    const show = (row: ComparedBuildRow) => {
      if (cancelled) return;
      setRows((prev) => prev.map((r) => (r.planId === row.planId ? row : r)));
    };

    if (groupDepthPrices) {
      void (async () => {
        const firstPass = await Promise.all(currentPlans.map((plan) => rowFor(plan)));
        if (cancelled) return;
        let shown = firstPass;
        try {
          const depthByHub = await groupDepthFor(currentPlans, firstPass, pricedByPlanId);
          if (cancelled) return;
          shown = await Promise.all(
            currentPlans.map(async (plan, i) => {
              const depth = depthByHub.get(hubIdOf(plan));
              return depth
                ? {
                    ...(await rowFor(plan, hubPricesAtPercent(depthPriceMap(depth), pricePercent))),
                    depth,
                  }
                : firstPass[i]!;
            })
          );
        } catch {}
        shown.forEach(show);
      })();
    } else {
      void (async () => {
        const maybeYield = createYielder();
        for (const plan of currentPlans) {
          if (cancelled) return;
          show(await rowFor(plan));
          await maybeYield();
        }
      })();
    }

    return () => {
      cancelled = true;
    };
  }, [
    plansKey,
    pricePercent,
    catalog,
    pi,
    ownedBlueprints,
    corpForPlans,
    ready,
    assumedMe,
    profitBasis,
    standings,
    bpcRows,
    communityRows,
    modifiers,
    computeGroupResult,
    groupDepthPrices,
  ]);

  return rows;
}
