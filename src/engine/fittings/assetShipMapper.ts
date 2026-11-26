import { fighterFlagState, slotFromFlag } from './inventoryFlags';
import {
  sortFittingModules,
  type Fitting,
  type FittingCargoItem,
  type FittingDrone,
  type FittingFighter,
  type FittingModule,
  type ItemMutation,
} from './types';

export interface ShipAssetItem {
  typeId: number;
  quantity: number;
  flag: string;
  itemId?: number;
}

export function shipAssetItem(asset: {
  type_id: number;
  quantity: number;
  location_flag: string;
  item_id: number;
}): ShipAssetItem {
  return {
    typeId: asset.type_id,
    quantity: asset.quantity,
    flag: asset.location_flag,
    itemId: asset.item_id,
  };
}

export function assetShipToFitting(
  ship: { typeId: number; name: string },
  items: readonly ShipAssetItem[],
  isModule: (typeId: number) => boolean,
  mutations: ReadonlyMap<number, ItemMutation> = new Map()
): Fitting {
  const modules = new Map<string, FittingModule>();
  const charges = new Map<string, number>();
  const drones: FittingDrone[] = [];
  const cargo: FittingCargoItem[] = [];
  const fighters: FittingFighter[] = [];
  for (const item of items) {
    const mutation = item.itemId === undefined ? undefined : mutations.get(item.itemId);
    const mutated = mutation ? { mutation } : {};
    const at = slotFromFlag(item.flag);
    const fighterState = fighterFlagState(item.flag);
    if (at) {
      if (isModule(item.typeId)) {
        modules.set(item.flag, { ...at, typeId: item.typeId, state: 'active', ...mutated });
      } else {
        charges.set(item.flag, item.typeId);
      }
    } else if (fighterState) {
      fighters.push({ typeId: item.typeId, quantity: item.quantity, state: fighterState });
    } else if (item.flag === 'DroneBay') {
      drones.push({ typeId: item.typeId, quantity: item.quantity, state: 'online', ...mutated });
    } else if (item.flag === 'Cargo') {
      cargo.push({ typeId: item.typeId, quantity: item.quantity });
    }
  }
  const fitted = [...modules].map(([flag, module]) => {
    const chargeTypeId = charges.get(flag);
    return chargeTypeId === undefined ? module : { ...module, chargeTypeId };
  });
  return {
    name: ship.name,
    shipTypeId: ship.typeId,
    modules: sortFittingModules(fitted),
    drones,
    cargo,
    ...(fighters.length > 0 ? { fighters } : {}),
  };
}
