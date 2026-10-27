/**
 * "Make it fit" for the open Fitting (`findFitSwaps`): every fitted module's
 * and rig's meta siblings are recalculated whole under the same evaluator the
 * page's stats come from, priced at the pilot's Trade Hub. Runs only while
 * `enabled`, so a closed dialog costs nothing.
 */
import { useEffect, useMemo, useState } from 'react';
import type { FittingStats } from '@/engine/fittings/types';
import { findFitSwaps, type FitSwap, type FitSwapsResult } from '@/engine/fittings/makeItFit';
import { buildVariationIndex, getVariations } from '@/engine/market/variations';
import { useMarketHub } from '@/features/market/hub';
import { DEFAULT_TRADE_HUB, getTradeHub } from '@/market/hubs';
import { getHubPrices } from '@/market/prices';
import type { FittingCatalogue } from './useFittingCatalogue';
import type { VariantEvaluator } from './useFittingEvaluation';
import { yieldToEventLoop } from './yieldToEventLoop';

export interface MakeItFitState {
  /** Null while calculating. */
  result: FitSwapsResult | null;
  /** The calculation threw; there is no result to show. */
  failed: boolean;
  /** The open Fitting's stats as they stand, for each option's change list. */
  before: FittingStats | null;
}

export function useMakeItFit(
  variants: VariantEvaluator | null,
  catalogue: FittingCatalogue | null,
  enabled: boolean
): MakeItFitState {
  const hubId = useMarketHub((state) => state.value);
  const [failed, setFailed] = useState<VariantEvaluator | null>(null);
  const [computed, setComputed] = useState<{
    variants: VariantEvaluator;
    result: FitSwapsResult;
    before: FittingStats;
  } | null>(null);

  const candidates = useMemo<FitSwap[]>(() => {
    if (!enabled || !variants || !catalogue) return [];
    const index = buildVariationIndex(catalogue.variations.types, catalogue.variations.metaGroups);
    return variants.fitting.modules.flatMap((module) =>
      getVariations(index, module.typeId)
        .members.filter(
          (member) =>
            member.typeId !== module.typeId &&
            catalogue.rackOf[String(member.typeId)] === module.slot
        )
        .map((member) => ({
          slot: module.slot,
          slotIndex: module.slotIndex,
          fromTypeId: module.typeId,
          toTypeId: member.typeId,
        }))
    );
  }, [enabled, variants, catalogue]);

  useEffect(() => {
    if (!enabled || !variants) return;
    let cancelled = false;
    void (async () => {
      const typeIds = [...new Set(candidates.flatMap((c) => [c.fromTypeId, c.toTypeId]))];
      const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;
      const priceMap = await getHubPrices(hub, typeIds).catch(() => null);
      if (cancelled) return;
      try {
        const { before } = await variants.compare(variants.fitting);
        const result = await findFitSwaps({
          fitting: variants.fitting,
          before,
          candidates,
          stats: async (fitting) => (await variants.compare(fitting)).after,
          priceOf: (typeId) => priceMap?.get(typeId)?.sellMin ?? null,
          yieldFn: yieldToEventLoop,
          isCancelled: () => cancelled,
        });
        if (!cancelled) setComputed({ variants, result, before });
      } catch {
        if (!cancelled) setFailed(variants);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, variants, candidates, hubId]);

  const fresh = computed && computed.variants === variants ? computed : null;
  return {
    result: fresh?.result ?? null,
    before: fresh?.before ?? null,
    failed: failed === variants,
  };
}
