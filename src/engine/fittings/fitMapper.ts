import type { Fit, FitItem, Slot } from '@eveshipfit/dogma-engine';
import { sideEffectsSwitchedOn } from './boosterSideEffects';
import { defaultTacticalMode, tacticalModesFor } from './tacticalModes';
import type { DamageProfile, Fitting, FittingModule, PilotProfile } from './types';

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

function launchFighters(fitting: Fitting): FitItem[] {
  let tube = 0;
  return (fitting.fighters ?? []).map((fighter): FitItem =>
    fighter.state === 'active'
      ? {
          type_id: fighter.typeId,
          slot: { type: 'fighter_tube', index: tube++ },
          quantity: fighter.quantity,
          state: 'active',
        }
      : {
          type_id: fighter.typeId,
          slot: { type: 'fighter_bay' },
          quantity: fighter.quantity,
          state: 'offline',
        }
  );
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
 *
 * With a `damageProfile`, EHP is measured against it and any Reactive Armor
 * Hardener adapts to it; without one the engine's own default (uniform, RAH
 * not adapted) applies. The key is left off rather than set to `undefined` —
 * the engine rejects an explicit `environment: undefined` (live run,
 * 2026-09-24).
 */
export function fittingToDogmaFit(
  fitting: Fitting,
  profile: PilotProfile,
  damageProfile?: DamageProfile
): Fit {
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
    // Launched squadrons take the tubes in order; the rest wait in the bay.
    ...launchFighters(fitting),
    ...fitting.cargo.map((item): FitItem => ({
      type_id: item.typeId,
      slot: { type: 'cargo' },
      quantity: item.quantity,
      state: 'offline',
    })),
    ...profile.implantTypeIds.map((typeId, index) => slottedItem(typeId, index, 'implant')),
    // Only the side effects the pilot switched on, and only each booster's
    // own; an empty array is the engine's own "none"
    // (`FitItem.booster_side_effects`'s doc).
    ...profile.boosterTypeIds.map((typeId, index) =>
      slottedItem(typeId, index, 'booster', {
        booster_side_effects: sideEffectsSwitchedOn(typeId, profile.boosterSideEffects),
      })
    ),
  ];

  // A Tactical Destroyer always flies in a mode: the chosen one if it's the
  // hull's own, else the hull's default. Any other hull has none.
  const modes = tacticalModesFor(fitting.shipTypeId);
  const mode =
    fitting.mode !== undefined && modes.includes(fitting.mode)
      ? fitting.mode
      : defaultTacticalMode(fitting.shipTypeId);

  return {
    name: fitting.name,
    ship: { type_id: fitting.shipTypeId, ...(mode === undefined ? {} : { mode }) },
    items,
    character: { skills: profile.skillLevels },
    ...(damageProfile
      ? {
          environment: {
            damage_profile: {
              em: damageProfile.em,
              thermal: damageProfile.thermal,
              kinetic: damageProfile.kinetic,
              explosive: damageProfile.explosive,
            },
            reactive_armor: 'damage_profile' as const,
          },
        }
      : {}),
  };
}
