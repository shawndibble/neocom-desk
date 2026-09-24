/**
 * The static data the Fitting editor (issue #1533) browses and names things
 * from: `types.json` for names and charge groups, `fittingSlots.json` for
 * which rack an item takes, and the Market Browser's own market-group tree,
 * market types and meta groups. None of it needs the dogma engine, which is
 * why search works before the ship data has downloaded.
 */
import { useEffect, useState } from 'react';
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

/** Null until every file has loaded (or if any failed — the editor then offers no Add). */
export function useFittingCatalogue(): FittingCatalogue | null {
  const [catalogue, setCatalogue] = useState<FittingCatalogue | null>(null);
  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      loadTypes(),
      loadFittingSlots(),
      loadMarketTypes(),
      loadMarketGroups(),
      loadVariations(),
    ])
      .then(([types, rackOf, marketTypes, groups, variations]) => {
        if (!cancelled)
          setCatalogue(buildCatalogue(types, rackOf, marketTypes, groups, variations));
      })
      .catch(() => {
        // Stays null: names fall back to icons, and Add is unavailable.
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return catalogue;
}
