/**
 * Per-module variations: a fitted module's T1/T2/faction/deadspace/officer
 * siblings, each with the whole-Fitting delta of swapping it in, CPU/PG/
 * calibration budget, active-Character can-fly, and Jita sell price. Rows
 * settle in async, keyed by fitting/profile/slot so a change mid-computation
 * never shows stale numbers under a new module or Character.
 *
 * Computes its own "before" baseline rather than trusting a caller-supplied
 * `FittingStats` — the workspace's own `stats` lags `fitting`/`profile` by
 * one recalculation after an edit or Character switch.
 */
import { useEffect, useMemo, useState } from 'react';
import { swapModuleType } from '@/engine/fittings/fittingEdit';
import { fitsResourceBudget } from '@/engine/fittings/skillGaps';
import type { Fitting, FittingSlotKind, FittingStats, PilotProfile } from '@/engine/fittings/types';
import { diffFittingStats, type FittingStatsDelta } from '@/engine/fittings/variationDelta';
import {
  buildVariationIndex,
  getVariations,
  type VariationIndex,
} from '@/engine/market/variations';
import { DEFAULT_TRADE_HUB } from '@/market/hubs';
import { getHubPrices } from '@/market/prices';
import { checkCandidates, computeFittingStats } from './dogmaFittingEngine';
import { catalogueTypeName, type FittingCatalogue } from './useFittingCatalogue';

/** Keyed by Fitting then PilotProfile (both stable references across re-renders) so switching which module's panel is open doesn't repeat the whole-fit `calculate()` call. Evicted on failure so a transient error doesn't wedge every future attempt. */
const baselineCache = new WeakMap<Fitting, WeakMap<PilotProfile, Promise<FittingStats>>>();

function getBaselineStats(fitting: Fitting, profile: PilotProfile): Promise<FittingStats> {
  let byProfile = baselineCache.get(fitting);
  if (!byProfile) {
    byProfile = new WeakMap();
    baselineCache.set(fitting, byProfile);
  }
  const cached = byProfile.get(profile);
  if (cached) return cached;
  const promise = computeFittingStats(fitting, profile, undefined, { overheated: false });
  byProfile.set(profile, promise);
  promise.catch(() => byProfile?.delete(profile));
  return promise;
}

export interface VariationRow {
  typeId: number;
  name: string;
  metaGroupName: string;
  delta: FittingStatsDelta | null;
  fits: boolean | null;
  canFly: boolean | null;
  /** Jita sell price; null if the hub has no sell orders for it. */
  price: number | null;
}

interface UseModuleVariationsParams {
  fitting: Fitting | null;
  slot: FittingSlotKind;
  slotIndex: number;
  /** The type currently fitted at slot/slotIndex — excluded from its own sibling list. */
  typeId: number;
  catalogue: FittingCatalogue | null;
  engineReady: boolean;
  profile: PilotProfile | null;
}

interface ComputedEntry {
  delta: FittingStatsDelta;
  fits: boolean;
  canFly: boolean;
}

export function useModuleVariations({
  fitting,
  slot,
  slotIndex,
  typeId,
  catalogue,
  engineReady,
  profile,
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
    fitting: Fitting;
    profile: PilotProfile;
    slot: FittingSlotKind;
    slotIndex: number;
    byTypeId: ReadonlyMap<number, ComputedEntry>;
  } | null>(null);

  const [prices, setPrices] = useState<{
    typeIds: readonly number[];
    byTypeId: ReadonlyMap<number, number | null>;
  } | null>(null);

  useEffect(() => {
    if (!fitting || !profile || !engineReady || members.length === 0) return;
    let cancelled = false;
    void (async () => {
      // A run stale by the time it lands (fitting/profile/slot changed
      // meanwhile) is simply dropped — the effect that superseded it already
      // has its own in-flight computation.
      const before = await getBaselineStats(fitting, profile).catch(() => null);
      if (cancelled || before === null) return;

      const typeIds = members.map((member) => member.typeId);
      const candidateChecks = checkCandidates(fitting.shipTypeId, slot, typeIds, profile);
      // `allSettled`, not `all`: one sibling's `calculate()` throwing (stale
      // SDE variation data, a slot mismatch) must not blank every other row
      // — each failure just leaves that row's delta/fits/canFly at null
      // rather than wedging the whole panel on "loading" forever.
      const settled = await Promise.allSettled(
        members.map(async (member): Promise<[number, ComputedEntry]> => {
          const swapped = swapModuleType(fitting, slot, slotIndex, member.typeId);
          const after = await computeFittingStats(swapped, profile, undefined, {
            overheated: false,
          });
          const check = candidateChecks.get(member.typeId);
          return [
            member.typeId,
            {
              delta: diffFittingStats(before, after),
              fits: fitsResourceBudget(after) && (check?.fitsHull ?? true),
              canFly: check?.canFly ?? true,
            },
          ];
        })
      );
      if (cancelled) return;
      const entries = settled.flatMap((result) =>
        result.status === 'fulfilled' ? [result.value] : []
      );
      setComputed({ fitting, profile, slot, slotIndex, byTypeId: new Map(entries) });
    })();
    return () => {
      cancelled = true;
    };
  }, [fitting, profile, engineReady, members, slot, slotIndex]);

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
    computed.fitting === fitting &&
    computed.profile === profile &&
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
    canFly: fresh?.byTypeId.get(member.typeId)?.canFly ?? null,
    price: freshPrices?.byTypeId.get(member.typeId) ?? null,
  }));

  return { rows, loading: members.length > 0 && fresh === null };
}
