/**
 * Owned-stock detection for the open Build Plan (issue #181).
 *
 * Split in two so the expensive half survives switching plans: `Industry.tsx`
 * remounts `BuildPlanDetail` on every selection change (`key={plan.id}`, so
 * each plan gets its own fresh local UI state), which used to also remount
 * this hook and redo the whole-account asset load + cache-first aggregation
 * from scratch on every click. `useOwnedStockSnapshot` loads every
 * Character's assets once, called from above that remount boundary;
 * `useDetectedOwnedStock` takes the result and does only the cheap,
 * per-plan part — count against *this* plan's material set, then resolve
 * names for just the locations the count surfaced.
 *
 * The aggregation memo is keyed on the snapshot and the *blueprint's*
 * material typeIDs — deliberately not on the computed cost lines, whose array
 * identity changes on every runs/ME/TE keystroke. Detected stock does not
 * depend on runs, and an asset list can run to tens of thousands of rows per
 * Character, so re-counting per keystroke would be a real cost.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  detectOwnedStock,
  type DetectedOwnedStockMap,
  type OwnedStockPlacement,
} from '@/engine/industry/ownedStock';
import {
  EMPTY_OWNED_STOCK_SNAPSHOT,
  loadOwnedStockSnapshot,
  resolveStockLocationNames,
  type OwnedStockSnapshot,
} from './ownedStockDetection';

const NO_STOCK: DetectedOwnedStockMap = new Map();
const NO_NAMES: ReadonlyMap<number, string> = new Map();

export interface DetectedOwnedStockResult {
  stock: DetectedOwnedStockMap;
  characterNames: ReadonlyMap<number, string>;
  locationNames: ReadonlyMap<number, string>;
  /** Names of Characters whose asset list was short or unreadable. */
  incompleteCharacters: readonly string[];
}

/**
 * Loads every Character's assets once — call this above whatever remount
 * boundary switches plans, and pass its result into `useDetectedOwnedStock`
 * for each plan.
 */
export function useOwnedStockSnapshot(): OwnedStockSnapshot {
  const [snapshot, setSnapshot] = useState<OwnedStockSnapshot>(EMPTY_OWNED_STOCK_SNAPSHOT);

  useEffect(() => {
    let cancelled = false;
    // A detection that cannot load is simply no suggestion: the plan is fully
    // usable without it, so nothing here surfaces an error state.
    void loadOwnedStockSnapshot().then(
      (loaded) => {
        if (!cancelled) setSnapshot(loaded);
      },
      () => {}
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return snapshot;
}

/**
 * @param snapshot the whole-account asset snapshot from `useOwnedStockSnapshot`.
 * @param typeIDs the plan's material typeIDs. Pass a referentially stable array
 * (a `useMemo` keyed off the blueprint) — it keys the aggregation memo.
 */
export function useDetectedOwnedStock(
  snapshot: OwnedStockSnapshot,
  typeIDs: readonly number[]
): DetectedOwnedStockResult {
  const [locationNames, setLocationNames] = useState<ReadonlyMap<number, string>>(NO_NAMES);

  const typeIDSet = useMemo(() => new Set(typeIDs), [typeIDs]);

  const stock = useMemo(
    () =>
      snapshot.sources.length === 0 ? NO_STOCK : detectOwnedStock(snapshot.sources, typeIDSet),
    [snapshot, typeIDSet]
  );

  useEffect(() => {
    // Nothing detected yet, so nothing to name. Names already resolved are
    // left in place rather than cleared: they are only ever read by the
    // locationId of a *current* placement, so a stale entry is unreachable,
    // and clearing here would be a synchronous setState in an effect body.
    if (stock.size === 0) return;
    let cancelled = false;
    const placements: OwnedStockPlacement[] = [];
    for (const entry of stock.values()) placements.push(...entry.placements);
    void resolveStockLocationNames(placements).then(
      (names) => {
        if (!cancelled) setLocationNames(names);
      },
      () => {}
    );
    return () => {
      cancelled = true;
    };
  }, [stock]);

  return {
    stock,
    characterNames: snapshot.characterNames,
    locationNames,
    incompleteCharacters: snapshot.incompleteCharacters,
  };
}
