import type { Fit, FitItem, Slot } from '@eveshipfit/dogma-engine';
import type { Fitting, FittingModule, PilotProfile } from './types';

/** EVE numbers implant/booster slots starting at 1, not 0 (dogma-engine's own `Slot` doc). */
const IMPLANT_SLOT_START = 1;

function moduleToFitItem(module: FittingModule): FitItem {
  const slot: Slot = { type: module.slot, index: module.slotIndex };
  return {
    type_id: module.typeId,
    slot,
    state: module.state,
    ...(module.chargeTypeId === undefined ? {} : { charge: { type_id: module.chargeTypeId } }),
  };
}

/**
 * The one place `Fitting` + `PilotProfile` become the `Fit` shape
 * `@eveshipfit/dogma-engine` expects (ADR 0016). Pure — only `Fit`'s type is
 * imported, never the engine itself; `dogmaFittingEngine.ts` is what actually
 * calls it.
 */
export function fittingToDogmaFit(fitting: Fitting, profile: PilotProfile): Fit {
  const items: FitItem[] = [
    ...fitting.modules.map(moduleToFitItem),
    ...fitting.drones.map((drone): FitItem => ({
      type_id: drone.typeId,
      slot: { type: 'drone_bay' },
      quantity: drone.quantity,
      state: drone.state,
    })),
    ...fitting.cargo.map((item): FitItem => ({
      type_id: item.typeId,
      slot: { type: 'cargo' },
      quantity: item.quantity,
      state: 'offline',
    })),
    ...profile.implantTypeIds.map((typeId, index): FitItem => ({
      type_id: typeId,
      slot: { type: 'implant', index: index + IMPLANT_SLOT_START },
      state: 'online',
    })),
  ];

  return {
    name: fitting.name,
    ship: { type_id: fitting.shipTypeId },
    items,
    character: { skills: profile.skillLevels },
  };
}
