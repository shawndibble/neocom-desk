import type { AssetTreeContainerNode, AssetTreeNode } from '@/engine/assetTree';
import {
  assetShipToFitting,
  shipAssetItem,
  type ShipAssetItem,
} from '@/engine/fittings/assetShipMapper';
import { loadFittingSlots } from '@/sde/loadSde';
import type { Fitting, ItemMutation } from '@/engine/fittings/types';
import { mutationsForItems } from '@/features/abyssal/dynamicItems';
import { loadMutaplasmidLookup } from '@/features/abyssal/mutaplasmidData';
import { fittingEditLocationFor } from './fittingEditLink';

function shipItems(ship: AssetTreeContainerNode): ShipAssetItem[] {
  const items: ShipAssetItem[] = [];
  const visit = (node: AssetTreeNode) => {
    if (node.kind === 'bay') {
      node.children.forEach(visit);
      return;
    }
    items.push(shipAssetItem(node.asset));
  };
  ship.children.forEach(visit);
  return items;
}

const ROLLS_TIMEOUT_MS = 8000;

async function shipMutations(items: readonly ShipAssetItem[]): Promise<Map<number, ItemMutation>> {
  try {
    const lookup = await loadMutaplasmidLookup();
    const refs = items.flatMap((item) =>
      item.itemId !== undefined && lookup.isAbyssalType(item.typeId)
        ? [{ typeId: item.typeId, itemId: item.itemId }]
        : []
    );
    return refs.length === 0
      ? new Map()
      : await mutationsForItems(refs, lookup, { signal: AbortSignal.timeout(ROLLS_TIMEOUT_MS) });
  } catch {
    return new Map();
  }
}

export async function assetShipEditLocation(
  ship: AssetTreeContainerNode,
  name: string
): Promise<{ pathname: string; search: string } | null> {
  return shipItemsEditLocation({ typeId: ship.asset.type_id, name }, shipItems(ship));
}

export async function shipItemsEditLocation(
  ship: { typeId: number; name: string },
  items: readonly ShipAssetItem[]
): Promise<{ pathname: string; search: string } | null> {
  return fittingEditLocationFor(await shipItemsToFitting(ship, items));
}

export async function shipItemsToFitting(
  ship: { typeId: number; name: string },
  items: readonly ShipAssetItem[]
): Promise<Fitting> {
  const [rackOf, mutations] = await Promise.all([loadFittingSlots(), shipMutations(items)]);
  return assetShipToFitting(
    ship,
    items,
    (typeId) => {
      const rack = rackOf[String(typeId)];
      return rack !== undefined && rack !== 'drone';
    },
    mutations
  );
}
