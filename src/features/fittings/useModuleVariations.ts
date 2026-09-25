/**
 * Per-module variations: a fitted module's T1/T2/faction/deadspace/officer
 * siblings, each with the whole-Fitting delta of swapping it in, CPU/PG/
 * calibration budget, active-Character can-fly, and Jita sell price. Rows
 * settle in async, keyed by evaluator/slot so a change mid-computation
 * never shows stale numbers under a new module or Character.
 *
 * Every number comes from the open Fitting's `VariantEvaluator`
 * (`useFittingEvaluation`), which works out its own "before" baseline under
 * the same pilot, implant basis and Damage Profile as the main stats rather
 * than trusting the workspace's `stats`, which lag an edit or Character
 * switch by one recalculation.
 */
import { useEffect, useMemo, useState } from 'react';
import { swapModuleType } from '@/engine/fittings/fittingEdit';
import {
  firstResourceOverage,
  fitsResourceBudget,
  type ResourceBudgetOverage,
} from '@/engine/fittings/skillGaps';
import type { FittingSlotKind } from '@/engine/fittings/types';
import { diffFittingStats, type FittingStatsDelta } from '@/engine/fittings/variationDelta';
import {
  buildVariationIndex,
  getVariations,
  type VariationIndex,
} from '@/engine/market/variations';
import { DEFAULT_TRADE_HUB } from '@/market/hubs';
import { getHubPrices } from '@/market/prices';
import { checkCandidates } from './dogmaFittingEngine';
import { catalogueTypeName, type FittingCatalogue } from './useFittingCatalogue';
import type { VariantEvaluator } from './useFittingEvaluation';

export interface VariationRow {
  typeId: number;
  name: string;
  metaGroupName: string;
  delta: FittingStatsDelta | null;
  fits: boolean | null;
  /** Set only when the swap is over a CPU/PG/calibration budget; null otherwise (including a hull-rule miss). */
  overage: ResourceBudgetOverage | null;
  canFly: boolean | null;
  /** Jita sell price; null if the hub has no sell orders for it. */
  price: number | null;
}

interface UseModuleVariationsParams {
  /** The open Fitting's evaluator; rows list without numbers while it's null. */
  variants: VariantEvaluator | null;
  slot: FittingSlotKind;
  slotIndex: number;
  /** The type currently fitted at slot/slotIndex — excluded from its own sibling list. */
  typeId: number;
  catalogue: FittingCatalogue | null;
}

interface ComputedEntry {
  delta: FittingStatsDelta;
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
  // Split from `members` below: the index walks every variation-grouped type
  // in the SDE, so it's worth keeping across a module switch that doesn't
  // change `catalogue` — only `getVariations` needs to rerun per module.
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

  const [prices, setPrices] = useState<{
    typeIds: readonly number[];
    byTypeId: ReadonlyMap<number, number | null>;
  } | null>(null);

  useEffect(() => {
    if (!variants || members.length === 0) return;
    let cancelled = false;
    void (async () => {
      const typeIds = members.map((member) => member.typeId);
      const candidateChecks = checkCandidates(
        variants.fitting.shipTypeId,
        slot,
        typeIds,
        variants.profile
      );
      // `allSettled`, not `all`: one sibling's `calculate()` throwing (stale
      // SDE variation data, a slot mismatch) must not blank every other row
      // — each failure just leaves that row's delta/fits/canFly at null
      // rather than wedging the whole panel on "loading" forever.
      const settled = await Promise.allSettled(
        members.map(async (member): Promise<[number, ComputedEntry]> => {
          const swapped = swapModuleType(variants.fitting, slot, slotIndex, member.typeId);
          const { before, after } = await variants.compare(swapped);
          const check = candidateChecks.get(member.typeId);
          return [
            member.typeId,
            {
              delta: diffFittingStats(before, after),
              fits: fitsResourceBudget(after) && (check?.fitsHull ?? true),
              overage: firstResourceOverage(after),
              canFly: check?.canFly ?? true,
            },
          ];
        })
      );
      // A run stale by the time it lands (evaluator/slot changed meanwhile)
      // is simply dropped — the effect that superseded it already has its
      // own in-flight computation.
      if (cancelled) return;
      const entries = settled.flatMap((result) =>
        result.status === 'fulfilled' ? [result.value] : []
      );
      setComputed({ variants, slot, slotIndex, byTypeId: new Map(entries) });
    })();
    return () => {
      cancelled = true;
    };
  }, [variants, members, slot, slotIndex]);

  useEffect(() => {
    if (members.length === 0) return;
    let cancelled = false;
    const typeIds = members.map((member) => member.typeId);
    void getHubPrices(DEFAULT_TRADE_HUB, typeIds)
      .then((priceMap) => {
        if (cancelled) return;
        const byTypeId = new Map<number, number | null>(
          typeIds.map((id) => [id, priceMap.get(id)?.sellMin ?? null])
        );
        setPrices({ typeIds, byTypeId });
      })
      .catch(() => {
        // Left null: rows show "no sell orders", the same degrade a hub
        // with no orders at all produces, rather than a broken loading state.
      });
    return () => {
      cancelled = true;
    };
  }, [members]);

  const fresh =
    computed &&
    computed.variants === variants &&
    computed.slot === slot &&
    computed.slotIndex === slotIndex
      ? computed
      : null;
  const freshPrices =
    prices && members.every((member) => prices.typeIds.includes(member.typeId)) ? prices : null;

  const rows: VariationRow[] = members.map((member) => ({
    typeId: member.typeId,
    name: catalogueTypeName(catalogue, member.typeId),
    metaGroupName: member.metaGroupName,
    delta: fresh?.byTypeId.get(member.typeId)?.delta ?? null,
    fits: fresh?.byTypeId.get(member.typeId)?.fits ?? null,
    overage: fresh?.byTypeId.get(member.typeId)?.overage ?? null,
    canFly: fresh?.byTypeId.get(member.typeId)?.canFly ?? null,
    price: freshPrices?.byTypeId.get(member.typeId) ?? null,
  }));

  return { rows, loading: members.length > 0 && fresh === null };
}
