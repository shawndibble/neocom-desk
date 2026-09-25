/**
 * Where "Open in Fittings" on an Assets ship goes: the Fittings editor, with
 * the ship as it sits in the hangar — slots, loaded charges, drones, cargo —
 * as its Share Link. Null when it's too large for one.
 */
import type { AssetTreeContainerNode, AssetTreeNode } from '@/engine/assetTree';
import { encodeFittingShare } from '@/engine/fitting/fittingShare';
import { assetShipToFitting, type ShipAssetItem } from '@/engine/fittings/assetShipMapper';
import { fittingToShareInput } from '@/engine/fittings/shareMapper';
import { loadFittingSlots } from '@/sde/loadSde';
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
    });
  };
  ship.children.forEach(visit);
  return items;
}

export async function assetShipEditLocation(
  ship: AssetTreeContainerNode,
  name: string
): Promise<{ pathname: string; search: string } | null> {
  const rackOf = await loadFittingSlots();
  const fitting = assetShipToFitting(
    { typeId: ship.asset.type_id, name },
    shipItems(ship),
    // A module has a rack; a charge in its slot doesn't (a drone's rack is its bay).
    (typeId) => {
      const rack = rackOf[String(typeId)];
      return rack !== undefined && rack !== 'drone';
    }
  );
  const encoded = await encodeFittingShare(fittingToShareInput(fitting));
  return encoded.ok ? fittingEditLocation(encoded.payload) : null;
}
