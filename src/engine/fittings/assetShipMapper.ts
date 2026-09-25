/**
 * An assembled ship in the Character's assets, read as a Fitting — the
 * Assets page's "Open in Fittings". The assets inside a ship carry the same
 * location flags an In-game Fitting's items do (`HiSlot0`, `DroneBay`,
 * `Cargo`…), with one difference: a loaded charge is an asset too, sitting
 * in its module's slot. Which of a slot's items is the module takes the
 * static data (`isModule`: it has a rack), which this pure module never
 * loads itself. Bays the editor has no place for (fleet hangar, ore hold…)
 * are left out.
 */
import {
  sortFittingModules,
  type Fitting,
  type FittingCargoItem,
  type FittingDrone,
  type FittingModule,
  type FittingSlotKind,
} from './types';

export interface ShipAssetItem {
  typeId: number;
  quantity: number;
  /** The asset's `location_flag` inside the ship. */
  flag: string;
}

const SLOT_PREFIX: Record<string, FittingSlotKind> = {
  Hi: 'high',
  Med: 'medium',
  Lo: 'low',
  Rig: 'rig',
  SubSystem: 'subsystem',
};

const SLOT_FLAG = /^(Hi|Med|Lo|Rig|SubSystem)Slot(\d+)$/;

export function assetShipToFitting(
  ship: { typeId: number; name: string },
  items: readonly ShipAssetItem[],
  isModule: (typeId: number) => boolean
): Fitting {
  const modules = new Map<string, FittingModule>();
  const charges = new Map<string, number>();
  const drones: FittingDrone[] = [];
  const cargo: FittingCargoItem[] = [];
  for (const item of items) {
    const match = SLOT_FLAG.exec(item.flag);
    if (match) {
      if (isModule(item.typeId)) {
        modules.set(item.flag, {
          slot: SLOT_PREFIX[match[1]],
          slotIndex: Number(match[2]),
          typeId: item.typeId,
          state: 'active',
        });
      } else {
        charges.set(item.flag, item.typeId);
      }
    } else if (item.flag === 'DroneBay') {
      drones.push({ typeId: item.typeId, quantity: item.quantity, state: 'online' });
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
  };
}
