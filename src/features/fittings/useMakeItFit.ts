import { useEffect, useMemo, useState } from 'react';
import type { FittingStats } from '@/engine/fittings/types';
import { findFitSwaps, type FitSwap, type FitSwapsResult } from '@/engine/fittings/makeItFit';
import { buildVariationIndex, getVariations } from '@/engine/market/variations';
import { useHubFor } from '@/features/market/hub';
import { usePricePercentFor } from '@/features/market/pagePricePercents';
import { getHubPricesAt } from '@/features/market/hubPricesAtPercent';
import { DEFAULT_TRADE_HUB, getTradeHub } from '@/market/hubs';
import type { FittingCatalogue } from './useFittingCatalogue';
import type { VariantEvaluator } from './useFittingEvaluation';
import { yieldToEventLoop } from './yieldToEventLoop';

export interface MakeItFitState {
  result: FitSwapsResult | null;
  failed: boolean;
  before: FittingStats | null;
}

export function useMakeItFit(
  variants: VariantEvaluator | null,
  catalogue: FittingCatalogue | null,
  enabled: boolean
): MakeItFitState {
  const { hubId } = useHubFor('fittings');
  const percent = usePricePercentFor('fittings');
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
      const priceMap = await getHubPricesAt(hub, typeIds, percent).catch(() => null);
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
  }, [enabled, variants, candidates, hubId, percent]);

  const fresh = computed && computed.variants === variants ? computed : null;
  return {
    result: fresh?.result ?? null,
    before: fresh?.before ?? null,
    failed: failed === variants,
  };
}
