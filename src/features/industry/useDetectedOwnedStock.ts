import { NO_NAMES } from '@/lib/emptyCollections';

import { useEffect, useMemo, useState } from 'react';
import { ACCOUNT_SNAPSHOT_ID } from '@/lib/routeSnapshotCache';
import { useWarmLoad } from '@/lib/useWarmLoad';
import { subtractJobConsumption, type StockReduction } from '@/engine/industry/jobConsumedStock';
import {
  detectOwnedStock,
  type DetectedOwnedStockMap,
  type OwnedStockPlacement,
  type OwnedStockSource,
} from '@/engine/industry/ownedStock';
import {
  EMPTY_OWNED_STOCK_SNAPSHOT,
  loadOwnedStockSnapshot,
  resolveStockLocationNames,
  type OwnedStockSnapshot,
} from './ownedStockDetection';

const NO_STOCK: DetectedOwnedStockMap = new Map();

export interface DetectedOwnedStockResult {
  stock: DetectedOwnedStockMap;
  stockBeforeJobs: DetectedOwnedStockMap;
  reductions: readonly StockReduction[];
  characterNames: ReadonlyMap<number, string>;
  locationNames: ReadonlyMap<number, string>;
  incompleteCharacters: readonly string[];
}

export function useOwnedStockSnapshot(): OwnedStockSnapshot {
  return useWarmLoad(
    'ownedStockSnapshot',
    ACCOUNT_SNAPSHOT_ID,
    () => loadOwnedStockSnapshot(),
    EMPTY_OWNED_STOCK_SNAPSHOT
  );
}

export function useDetectedOwnedStock(
  snapshot: OwnedStockSnapshot,
  typeIDs: readonly number[],
  corpSource?: OwnedStockSource | null
): DetectedOwnedStockResult {
  const [locationNames, setLocationNames] = useState<ReadonlyMap<number, string>>(NO_NAMES);

  const typeIDSet = useMemo(() => new Set(typeIDs), [typeIDs]);

  const sources = useMemo(
    () => (corpSource ? [...snapshot.sources, corpSource] : snapshot.sources),
    [snapshot, corpSource]
  );

  const stockBeforeJobs = useMemo(
    () => (sources.length === 0 ? NO_STOCK : detectOwnedStock(sources, typeIDSet)),
    [sources, typeIDSet]
  );
  const { stock, reductions } = useMemo(
    () =>
      subtractJobConsumption(
        stockBeforeJobs,
        (snapshot.jobConsumption ?? []).filter((c) => typeIDSet.has(c.typeID))
      ),
    [stockBeforeJobs, snapshot.jobConsumption, typeIDSet]
  );

  useEffect(() => {
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
    stockBeforeJobs,
    reductions,
    characterNames: snapshot.characterNames,
    locationNames,
    incompleteCharacters: snapshot.incompleteCharacters,
  };
}
