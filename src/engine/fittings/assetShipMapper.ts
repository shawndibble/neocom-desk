/**
 * An assembled ship in the Character's assets, read as a Fitting — the
 * Assets page's "Open in Fittings". The assets inside a ship carry the same
 * location flags an In-game Fitting's items do (`HiSlot0`, `DroneBay`,
 * `Cargo`…), with one difference: a loaded charge is an asset too, sitting
 * in its module's slot. Which of a slot's items is the module takes the
 * static data (`isModule`: it has a rack), which this pure module never
 * loads itself. Fighter squadrons read as an In-game Fitting's do: a tube's
 * launched, the fighter bay's waiting. Bays the editor has no place for
 * (fleet hangar, ore hold…) are left out.
 */
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
  /** The asset's `location_flag` inside the ship. */
  flag: string;
  /** The asset's own `item_id`: what a mutated item's rolls are looked up by. */
  itemId?: number;
}

/** `mutations`: rolls by item id (`mutationsForItems`); an abyssal item absent from it loads base unknown. */
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
