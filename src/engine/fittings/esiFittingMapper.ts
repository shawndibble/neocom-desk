import { fighterFlagState, fighterTubes, slotFlag, slotFromFlag } from './inventoryFlags';
import type { LoadedFitting, LoadWarning } from './load';
import {
  sortFittingModules,
  type Fitting,
  type FittingCargoItem,
  type FittingDrone,
  type FittingFighter,
  type FittingModule,
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

export interface NewEsiFitting {
  name: string;
  description: string;
  ship_type_id: number;
  items: EsiFittingItem[];
}

const ESI_FIGHTER_TUBES = 5;

export function esiFittingToFitting(esiFitting: EsiCharacterFitting): LoadedFitting {
  const modules: FittingModule[] = [];
  const drones: FittingDrone[] = [];
  const cargo: FittingCargoItem[] = [];
  const fighters: FittingFighter[] = [];
  const unresolved: LoadWarning[] = [];

  for (const item of esiFitting.items) {
    const at = slotFromFlag(item.flag);
    if (at) {
      modules.push({ ...at, typeId: item.type_id, state: 'active' });
      continue;
    }
    if (item.flag === 'DroneBay') {
      drones.push({ typeId: item.type_id, quantity: item.quantity, state: 'online' });
      continue;
    }
    const fighterState = fighterFlagState(item.flag);
    if (fighterState) {
      fighters.push({ typeId: item.type_id, quantity: item.quantity, state: fighterState });
      continue;
    }
    if (item.flag === 'Cargo') {
      cargo.push({ typeId: item.type_id, quantity: item.quantity });
      continue;
    }
    unresolved.push({ text: item.flag, reason: 'unsupported slot', kind: 'unsupported-slot' });
  }

  return {
    kind: 'fitting',
    source: 'in-game',
    fitting: {
      name: esiFitting.name,
      shipTypeId: esiFitting.ship_type_id,
      modules: sortFittingModules(modules),
      drones,
      cargo,
      ...(fighters.length > 0 ? { fighters } : {}),
    },
    unresolved,
  };
}

export function fittingToEsiFitting(
  fitting: Fitting,
  name: string,
  description: string
): NewEsiFitting {
  const items: EsiFittingItem[] = [];
  for (const module of fitting.modules) {
    items.push({
      flag: slotFlag(module.slot, module.slotIndex),
      quantity: 1,
      type_id: module.typeId,
    });
  }
  for (const drone of fitting.drones) {
    items.push({ flag: 'DroneBay', quantity: drone.quantity, type_id: drone.typeId });
  }
  const fighters = fitting.fighters ?? [];
  const tubes = fighterTubes(fighters, ESI_FIGHTER_TUBES);
  fighters.forEach((fighter, index) => {
    const tube = tubes[index];
    items.push({
      flag: tube === null ? 'FighterBay' : `FighterTube${tube}`,
      quantity: fighter.quantity,
      type_id: fighter.typeId,
    });
  });
  for (const item of fitting.cargo) {
    items.push({ flag: 'Cargo', quantity: item.quantity, type_id: item.typeId });
  }
  return { name, description, ship_type_id: fitting.shipTypeId, items };
}
