/**
 * Where "Open in Fittings" on an Assets ship goes: the Fittings editor, with
 * the ship as it sits in the hangar — slots, loaded charges, drones,
 * fighters, cargo, and each mutated (abyssal) item's real rolls from ESI —
 * as its Fitting Share Code. Null when it's too large for one.
 */
import type { AssetTreeContainerNode, AssetTreeNode } from '@/engine/assetTree';
import { encodeFittingShare } from '@/engine/fittings/fittingShare';
import { assetShipToFitting, type ShipAssetItem } from '@/engine/fittings/assetShipMapper';
import { fittingToShareInput } from '@/engine/fittings/shareMapper';
import { loadFittingSlots } from '@/sde/loadSde';
import type { ItemMutation } from '@/engine/fittings/types';
import { mutationsForItems } from '@/features/abyssal/dynamicItems';
import { loadMutaplasmidLookup } from '@/features/abyssal/mutaplasmidData';
import { fittingEditLocation } from './fittingRoutes';

/** Every asset inside a ship, whichever bay the tree grouped it under. */
function shipItems(ship: AssetTreeContainerNode): ShipAssetItem[] {
  const items: ShipAssetItem[] = [];
  const visit = (node: AssetTreeNode) => {
    if (node.kind === 'bay') {
      node.children.forEach(visit);
      return;
    }
    items.push({
      typeId: node.asset.type_id,
      quantity: node.asset.quantity,
      flag: node.asset.location_flag,
      itemId: node.asset.item_id,
    });
  };
  ship.children.forEach(visit);
  return items;
}

/** How long Open in Fittings waits on ESI for a ship's rolls. */
const ROLLS_TIMEOUT_MS = 8000;

/** The ship's rolls by item id. Never fails the open: what won't answer loads base unknown. */
async function shipMutations(items: readonly ShipAssetItem[]): Promise<Map<number, ItemMutation>> {
  try {
    const lookup = await loadMutaplasmidLookup();
    const refs = items.flatMap((item) =>
      item.itemId !== undefined && lookup.isAbyssalType(item.typeId)
        ? [{ typeId: item.typeId, itemId: item.itemId }]
        : []
    );
    // A click waits on this: past the timeout, open with what arrived; the rest load base unknown.
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

/** The same, from a ship's direct contents already in hand (My ships reads a flat asset list, no tree). */
export async function shipItemsEditLocation(
  ship: { typeId: number; name: string },
  items: readonly ShipAssetItem[]
): Promise<{ pathname: string; search: string } | null> {
  const [rackOf, mutations] = await Promise.all([loadFittingSlots(), shipMutations(items)]);
  const fitting = assetShipToFitting(
    ship,
    items,
    // A module has a rack; a charge in its slot doesn't (a drone's rack is its bay).
    (typeId) => {
      const rack = rackOf[String(typeId)];
      return rack !== undefined && rack !== 'drone';
    },
    mutations
  );
  const encoded = await encodeFittingShare(fittingToShareInput(fitting));
  return encoded.ok ? fittingEditLocation(encoded.payload) : null;
}
