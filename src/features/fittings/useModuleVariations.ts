import { useCallback, useEffect, useMemo, useState } from 'react';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { swapModuleType } from '@/engine/fittings/fittingEdit';
import {
  firstResourceOverage,
  fitsResourceBudget,
  type ResourceBudgetOverage,
} from '@/engine/fittings/skillGaps';
import type { FittingSlotKind } from '@/engine/fittings/types';
import { swapChanges, type SwapChange } from '@/engine/fittings/swapChanges';
import {
  buildVariationIndex,
  getVariations,
  type VariationIndex,
} from '@/engine/market/variations';
import { useHubFor } from '@/features/market/hub';
import { usePricePercentFor } from '@/features/market/pagePricePercents';
import { getHubPricesAt } from '@/features/market/hubPricesAtPercent';
import { DEFAULT_TRADE_HUB, getTradeHub } from '@/market/hubs';
import { catalogueTypeName, type FittingCatalogue } from './useFittingCatalogue';
import type { VariantEvaluator } from './useFittingEvaluation';

export interface VariationRow {
  typeId: number;
  name: string;
  metaGroupName: string;
  delta: SwapChange[] | null;
  fits: boolean | null;
  overage: ResourceBudgetOverage | null;
  canFly: boolean | null;
  price: number | null;
}

interface UseModuleVariationsParams {
  variants: VariantEvaluator | null;
  slot: FittingSlotKind;
  slotIndex: number;
  typeId: number;
  catalogue: FittingCatalogue | null;
}

interface ComputedEntry {
  delta: SwapChange[];
  fits: boolean;
  overage: ResourceBudgetOverage | null;
  canFly: boolean;
}

export function useModuleVariations({
  variants,
  slot,
  slotIndex,
  typeId,
  catalogue,
}: UseModuleVariationsParams): { rows: VariationRow[]; loading: boolean } {
  const variationIndex: VariationIndex | null = useMemo(() => {
    if (!catalogue) return null;
    return buildVariationIndex(catalogue.variations.types, catalogue.variations.metaGroups);
  }, [catalogue]);

  const members = useMemo(() => {
    if (!variationIndex || !catalogue) return [];
    return getVariations(variationIndex, typeId).members.filter(
      (member) => member.typeId !== typeId && catalogue.rackOf[String(member.typeId)] === slot
    );
  }, [variationIndex, catalogue, typeId, slot]);

  const [computed, setComputed] = useState<{
    variants: VariantEvaluator;
    slot: FittingSlotKind;
    slotIndex: number;
    byTypeId: ReadonlyMap<number, ComputedEntry>;
  } | null>(null);

  useEffect(() => {
    if (!variants || members.length === 0) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      const typeIds = members.map((member) => member.typeId);
      const candidateChecks = variants.engine.checkCandidates(
        variants.fitting.shipTypeId,
        slot,
        typeIds,
        variants.profile
      );
      const entries: [number, ComputedEntry][] = [];
      for (const member of members) {
        if (cancelled) return;
        try {
          const swapped = swapModuleType(variants.fitting, slot, slotIndex, member.typeId);
          const { before, after } = await variants.compare(swapped, controller.signal);
          const check = candidateChecks.get(member.typeId);
          entries.push([
            member.typeId,
            {
              delta: swapChanges(before, after),
              fits: fitsResourceBudget(after) && (check?.fitsHull ?? true),
              overage: firstResourceOverage(after),
              canFly: check?.canFly ?? true,
            },
          ]);
        } catch {}
      }
      if (cancelled) return;
      setComputed({ variants, slot, slotIndex, byTypeId: new Map(entries) });
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [variants, members, slot, slotIndex]);

  const { hubId, hydrated: hubHydrated } = useHubFor('fittings');
  const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;
  const percent = usePricePercentFor('fittings');
  const loadPrices = useCallback(async () => {
    const typeIds = members.map((member) => member.typeId);
    if (typeIds.length === 0) return new Map<number, number | null>();
    const priceMap = await getHubPricesAt(hub, typeIds, percent);
    return new Map<number, number | null>(
      typeIds.map((id) => [id, priceMap.get(id)?.sellMin ?? null])
    );
  }, [members, hub, percent]);
  const freshPrices = useKeyedLoad(
    hubHydrated ? `prices:${hub.id}:${percent}` : null,
    loadPrices
  ).data;

  const fresh =
    computed &&
    computed.variants === variants &&
    computed.slot === slot &&
    computed.slotIndex === slotIndex
      ? computed
      : null;

  const rows: VariationRow[] = members.map((member) => ({
    typeId: member.typeId,
    name: catalogueTypeName(catalogue, member.typeId),
    metaGroupName: member.metaGroupName,
    delta: fresh?.byTypeId.get(member.typeId)?.delta ?? null,
    fits: fresh?.byTypeId.get(member.typeId)?.fits ?? null,
    overage: fresh?.byTypeId.get(member.typeId)?.overage ?? null,
    canFly: fresh?.byTypeId.get(member.typeId)?.canFly ?? null,
    price: freshPrices?.get(member.typeId) ?? null,
  }));

  return { rows, loading: members.length > 0 && fresh === null };
}
