import type { Fit, FitItem, Slot } from '@eveshipfit/dogma-engine';
import type { Fitting, FittingModule, PilotProfile } from './types';

/** EVE numbers implant/booster slots starting at 1, not 0 (dogma-engine's own `Slot` doc). */
const SLOT_INDEX_START = 1;

function moduleToFitItem(module: FittingModule): FitItem {
  const slot: Slot = { type: module.slot, index: module.slotIndex };
  return {
    type_id: module.typeId,
    slot,
    state: module.state,
    ...(module.chargeTypeId === undefined ? {} : { charge: { type_id: module.chargeTypeId } }),
  };
}

/** An implant or booster, numbered from `SLOT_INDEX_START` — same shape either way, just the slot type and (for a booster) side effects. */
function slottedItem(
  typeId: number,
  index: number,
  slotType: 'implant' | 'booster',
  extra?: Pick<FitItem, 'booster_side_effects'>
): FitItem {
  return {
    type_id: typeId,
    slot: { type: slotType, index: index + SLOT_INDEX_START },
    state: 'online',
    ...extra,
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
      // Engine treats a drone given 'online' as launched; its in-bay state is
      // 'offline', so a bay stack ('online' here) goes in as that.
      state: drone.state === 'active' ? 'active' : 'offline',
    })),
    ...fitting.cargo.map((item): FitItem => ({
      type_id: item.typeId,
      slot: { type: 'cargo' },
      quantity: item.quantity,
      state: 'offline',
    })),
    ...profile.implantTypeIds.map((typeId, index) => slottedItem(typeId, index, 'implant')),
    // Side effects always off — no UI to roll or pick one, and an empty array
    // is the engine's own "none" (`FitItem.booster_side_effects`'s doc).
    ...profile.boosterTypeIds.map((typeId, index) =>
      slottedItem(typeId, index, 'booster', { booster_side_effects: [] })
    ),
  ];

  return {
    name: fitting.name,
    ship: { type_id: fitting.shipTypeId },
    items,
    character: { skills: profile.skillLevels },
  };
}
