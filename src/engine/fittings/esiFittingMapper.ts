/**
 * Maps one of ESI's saved In-game Fittings (`GET .../fittings/`, issue #1539)
 * onto the domain `Fitting` shape — the "In-game Fittings" half of #1532.
 * ESI's fitting item carries no charge or online/offline state (it is a
 * static loadout, not a live ship), so every resolved module loads `'active'`
 * and carries no `chargeTypeId` — the same "nothing left to say otherwise"
 * reasoning as `eftLoader.ts`'s EFT-paste modules. `FighterBay`/`ServiceSlot*`
 * (carriers, structures) have no rack this app models, so they go to
 * `unresolved` rather than being dropped silently, same as `eftLoader.ts`.
 */
import {
  sortFittingModules,
  type Fitting,
  type FittingCargoItem,
  type FittingDrone,
  type FittingModule,
  type FittingSlotKind,
} from './types';

export interface EsiFittingItem {
  flag: string;
  quantity: number;
  type_id: number;
}

export interface EsiCharacterFitting {
  fitting_id: number;
  name: string;
  description: string;
  ship_type_id: number;
  items: EsiFittingItem[];
}

export interface EsiFittingUnresolvedItem {
  flag: string;
  typeId: number;
}

/**
 * The shape `postCharacterFitting` (`src/esi/endpoints.ts`) sends — named
 * locally so this module never imports the ESI layer (`src/engine` stays
 * fetch-free); structurally identical to that wrapper's `NewCharacterFitting`.
 */
export interface NewEsiFitting {
  name: string;
  description: string;
  ship_type_id: number;
  items: EsiFittingItem[];
}

const SLOT_PREFIX: Record<string, FittingSlotKind> = {
  Hi: 'high',
  Med: 'medium',
  Lo: 'low',
  Rig: 'rig',
  SubSystem: 'subsystem',
};

const FLAG_PREFIX: Record<FittingSlotKind, string> = {
  high: 'Hi',
  medium: 'Med',
  low: 'Lo',
  rig: 'Rig',
  subsystem: 'SubSystem',
};

const SLOT_FLAG = /^(Hi|Med|Lo|Rig|SubSystem)Slot(\d+)$/;

export function esiFittingToFitting(esiFitting: EsiCharacterFitting): {
  fitting: Fitting;
  unresolved: EsiFittingUnresolvedItem[];
} {
  const modules: FittingModule[] = [];
  const drones: FittingDrone[] = [];
  const cargo: FittingCargoItem[] = [];
  const unresolved: EsiFittingUnresolvedItem[] = [];

  for (const item of esiFitting.items) {
    const match = SLOT_FLAG.exec(item.flag);
    if (match) {
      modules.push({
        slot: SLOT_PREFIX[match[1]],
        slotIndex: Number(match[2]),
        typeId: item.type_id,
        state: 'active',
      });
      continue;
    }
    if (item.flag === 'DroneBay') {
      drones.push({ typeId: item.type_id, quantity: item.quantity, state: 'online' });
      continue;
    }
    if (item.flag === 'Cargo') {
      cargo.push({ typeId: item.type_id, quantity: item.quantity });
      continue;
    }
    unresolved.push({ flag: item.flag, typeId: item.type_id });
  }

  return {
    fitting: {
      name: esiFitting.name,
      shipTypeId: esiFitting.ship_type_id,
      modules: sortFittingModules(modules),
      drones,
      cargo,
    },
    unresolved,
  };
}

/**
 * The reverse of `esiFittingToFitting`, for Save to EVE (#1540). `name` and
 * `description` are taken as given rather than read off `fitting.name` — the
 * Save to EVE dialog lets a pilot rename on the way out, and ESI has no field
 * for a Fitting's own description. Module state, charges and implants have no
 * home in ESI's item list, so they are dropped here exactly as
 * `esiFittingToFitting` above never produced them coming back — the UI is
 * what has to say so before saving, not this mapper.
 */
export function fittingToEsiFitting(
  fitting: Fitting,
  name: string,
  description: string
): NewEsiFitting {
  const items: EsiFittingItem[] = [];
  for (const module of fitting.modules) {
    items.push({
      flag: `${FLAG_PREFIX[module.slot]}Slot${module.slotIndex}`,
      quantity: 1,
      type_id: module.typeId,
    });
  }
  for (const drone of fitting.drones) {
    items.push({ flag: 'DroneBay', quantity: drone.quantity, type_id: drone.typeId });
  }
  for (const item of fitting.cargo) {
    items.push({ flag: 'Cargo', quantity: item.quantity, type_id: item.typeId });
  }
  return { name, description, ship_type_id: fitting.shipTypeId, items };
}
