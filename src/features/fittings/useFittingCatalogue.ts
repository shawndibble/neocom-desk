/**
 * The static data the Fitting editor (issue #1533) browses and names things
 * from: `types.json` for names and charge groups, `fittingSlots.json` for
 * which rack an item takes, and the Market Browser's own market-group tree,
 * market types and meta groups. None of it needs the dogma engine, which is
 * why search works before the ship data has downloaded.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useRetryOnReconnect } from '@/lib/useRetryOnReconnect';
import type { CandidateRack } from '@/engine/fittings/candidates';
import { loadFittingSlots, loadTypes } from '@/sde/loadSde';
import { loadMarketGroups, loadMarketTypes, loadVariations } from '@/sde/loadMarketSde';
import type { MarketGroupNode, MarketTypeEntry, VariationData } from '@/sde/marketTypes';
import type { TypeMap } from '@/sde/types';

export interface FittingCatalogue {
  types: TypeMap;
  rackOf: Readonly<Record<string, CandidateRack>>;
  marketTypes: readonly MarketTypeEntry[];
  groupsById: ReadonlyMap<number, MarketGroupNode>;
  childrenByParent: ReadonlyMap<number | null, MarketGroupNode[]>;
  parentOf: ReadonlyMap<number, number | null>;
  /** Type ids per inventory group, for listing the charges a module's charge groups name. */
  typeIdsByGroup: ReadonlyMap<number, number[]>;
  variations: VariationData;
}

/** A type's name from the catalogue, or `#<id>` while it loads or when it has none. */
export function catalogueTypeName(catalogue: FittingCatalogue | null, typeId: number): string {
  return catalogue?.types[String(typeId)]?.name ?? `#${typeId}`;
}

/** One unit's m3 from the catalogue, or 0 while it loads or when it has none. */
export function catalogueVolume(catalogue: FittingCatalogue | null, typeId: number): number {
  return catalogue?.types[String(typeId)]?.volume ?? 0;
}

function buildCatalogue(
  types: TypeMap,
  rackOf: Record<string, CandidateRack>,
  marketTypes: MarketTypeEntry[],
  groups: MarketGroupNode[],
  variations: VariationData
): FittingCatalogue {
  const groupsById = new Map<number, MarketGroupNode>();
  const childrenByParent = new Map<number | null, MarketGroupNode[]>();
  const parentOf = new Map<number, number | null>();
  for (const group of groups) {
    groupsById.set(group.id, group);
    parentOf.set(group.id, group.parentId);
    const siblings = childrenByParent.get(group.parentId) ?? [];
    siblings.push(group);
    childrenByParent.set(group.parentId, siblings);
  }
  for (const siblings of childrenByParent.values())
    siblings.sort((a, b) => a.name.localeCompare(b.name));

  const typeIdsByGroup = new Map<number, number[]>();
  for (const [typeId, info] of Object.entries(types)) {
    const ids = typeIdsByGroup.get(info.groupID) ?? [];
    ids.push(Number(typeId));
    typeIdsByGroup.set(info.groupID, ids);
  }

  return {
    types,
    rackOf,
    marketTypes,
    groupsById,
    childrenByParent,
    parentOf,
    typeIdsByGroup,
    variations,
  };
}

/**
 * Whether the last load failed, shared by every `useFittingCatalogue` caller
 * (the editor page, the Add panel and the hull picker each read it without
 * threading it down as a prop). `epoch` is how a retry reaches every caller's
 * load effect at once.
 */
let loadFailed = false;
let loadEpoch = 0;
const statusListeners = new Set<() => void>();

function setLoadFailed(next: boolean): void {
  if (loadFailed === next) return;
  loadFailed = next;
  for (const listener of [...statusListeners]) listener();
}

function subscribeStatus(listener: () => void): () => void {
  statusListeners.add(listener);
  return () => void statusListeners.delete(listener);
}

/**
 * The catalogue built once per `loadEpoch` and shared by every hook instance, so
 * they all hold the same object (the `hullFitService` fingerprint cache keys on
 * it) and the SDE-wide passes in `buildCatalogue` run once, not once per mount.
 * A failed load is never kept, so a retry loads again.
 */
let cache: {
  epoch: number;
  promise: Promise<FittingCatalogue>;
  value: FittingCatalogue | null;
} | null = null;

function getCatalogue(): Promise<FittingCatalogue> {
  if (cache && cache.epoch === loadEpoch) return cache.promise;
  const entry: NonNullable<typeof cache> = {
    epoch: loadEpoch,
    value: null,
    promise: Promise.all([
      loadTypes(),
      loadFittingSlots(),
      loadMarketTypes(),
      loadMarketGroups(),
      loadVariations(),
    ]).then(([types, rackOf, marketTypes, groups, variations]) => {
      const built = buildCatalogue(types, rackOf, marketTypes, groups, variations);
      entry.value = built;
      return built;
    }),
  };
  cache = entry;
  entry.promise.then(
    () => {
      if (cache === entry) setLoadFailed(false);
    },
    () => {
      if (cache !== entry) return;
      cache = null;
      setLoadFailed(true);
    }
  );
  return entry.promise;
}

/** Test-only: forgets a failure, the retry count and the cached catalogue a previous test left in the module. */
export function resetFittingCatalogueStatusForTests(): void {
  loadFailed = false;
  loadEpoch = 0;
  cache = null;
}

/** Tries the catalogue files again. A no-op unless the last load failed, so several callers retrying together load once. */
export function retryFittingCatalogue(): void {
  if (!loadFailed) return;
  loadFailed = false;
  loadEpoch += 1;
  for (const listener of [...statusListeners]) listener();
}

/** Whether the catalogue files could not be loaded (not downloaded on this device and no connection). */
export function useFittingCatalogueFailed(): boolean {
  return useSyncExternalStore(
    subscribeStatus,
    () => loadFailed,
    () => false
  );
}

/**
 * Null until every file has loaded. If any failed it stays null, but
 * `useFittingCatalogueFailed()` turns true so the editor can say so and offer a
 * retry, and it loads again by itself when the connection returns.
 */
export function useFittingCatalogue(): FittingCatalogue | null {
  const [catalogue, setCatalogue] = useState<FittingCatalogue | null>(() =>
    cache?.epoch === loadEpoch ? cache.value : null
  );
  const epoch = useSyncExternalStore(
    subscribeStatus,
    () => loadEpoch,
    () => 0
  );
  const failed = useFittingCatalogueFailed();
  useEffect(() => {
    let cancelled = false;
    // Failure is reported by `getCatalogue` itself, once per load rather than per mount.
    getCatalogue().then(
      (built) => {
        if (!cancelled) setCatalogue(built);
      },
      () => {}
    );
    return () => {
      cancelled = true;
    };
  }, [epoch]);
  useRetryOnReconnect(failed, retryFittingCatalogue);
  return catalogue;
}
