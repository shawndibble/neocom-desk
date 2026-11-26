import { useEffect, useState, useSyncExternalStore } from 'react';
import { useRetryOnReconnect } from '@/lib/useRetryOnReconnect';
import type { CandidateRack } from '@/engine/fittings/candidates';
import { loadFittingSlots, loadTypes } from '@/sde/loadSde';
import { loadMarketGroups, loadMarketTypes, loadVariations } from '@/sde/loadMarketSde';
import type { MarketGroupNode, MarketTypeEntry, VariationData } from '@/sde/marketTypes';
import type { TypeMap } from '@/sde/types';
import {
  resolvedTypeNames,
  useResolvedTypeNames,
  type ResolvedTypeNames,
} from './resolvedTypeNames';

export interface FittingCatalogue {
  types: TypeMap;
  rackOf: Readonly<Record<string, CandidateRack>>;
  marketTypes: readonly MarketTypeEntry[];
  groupsById: ReadonlyMap<number, MarketGroupNode>;
  childrenByParent: ReadonlyMap<number | null, MarketGroupNode[]>;
  parentOf: ReadonlyMap<number, number | null>;
  typeIdsByGroup: ReadonlyMap<number, number[]>;
  variations: VariationData;
}

export function unnamedTypeName(typeId: number): string {
  return `#${typeId}`;
}

export function catalogueTypeName(
  catalogue: FittingCatalogue | null,
  typeId: number,
  resolved: ResolvedTypeNames = resolvedTypeNames()
): string {
  return catalogue?.types[String(typeId)]?.name ?? resolved.get(typeId) ?? unnamedTypeName(typeId);
}

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

export function resetFittingCatalogueStatusForTests(): void {
  loadFailed = false;
  loadEpoch = 0;
  cache = null;
}

export function retryFittingCatalogue(): void {
  if (!loadFailed) return;
  loadFailed = false;
  loadEpoch += 1;
  for (const listener of [...statusListeners]) listener();
}

export function useFittingCatalogueFailed(): boolean {
  return useSyncExternalStore(
    subscribeStatus,
    () => loadFailed,
    () => false
  );
}

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
  useResolvedTypeNames();
  useEffect(() => {
    let cancelled = false;
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
