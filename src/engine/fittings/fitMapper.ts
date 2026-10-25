import type { Fit, FitItem, Slot } from '@eveshipfit/dogma-engine';
import { sideEffectsSwitchedOn } from './boosterSideEffects';
import { fighterTubes } from './inventoryFlags';
import { defaultTacticalMode, tacticalModesFor } from './tacticalModes';
import { normaliseMutation, type MutaplasmidLookup } from './mutaplasmids';
import type { SlotOf } from './implantFinder';
import type { DamageProfile, Fitting, FittingModule, ItemMutation, PilotProfile } from './types';

/** EVE numbers implant/booster slots starting at 1, not 0 (dogma-engine's own `Slot` doc). */
const SLOT_INDEX_START = 1;

/**
 * The engine's `Mutation`, checked here whatever the source (`normaliseMutation`).
 * No rolls: the engine states the base module. No data loaded to check it
 * against: base only, so the base module's stats apply rather than an
 * attribute-less item. Fails the check (base, mutaplasmid and type don't
 * belong together): the item goes in bare, the engine knowing only its slot.
 */
function toEngineMutation(
  typeId: number,
  mutation: ItemMutation | undefined,
  mutaplasmids: MutaplasmidLookup | null
): Pick<FitItem, 'mutation'> {
  if (mutation && !mutaplasmids) return { mutation: { base: mutation.baseTypeId } };
  const checked = mutation && normaliseMutation(typeId, mutation, mutaplasmids);
  if (!checked) return {};
  const rolled = Object.keys(checked.attributes).length > 0;
  return {
    mutation: {
      base: checked.baseTypeId,
      ...(rolled ? { attributes: checked.attributes } : {}),
    },
  };
}

function moduleToFitItem(module: FittingModule, mutaplasmids: MutaplasmidLookup | null): FitItem {
  const slot: Slot = { type: module.slot, index: module.slotIndex };
  return {
    type_id: module.typeId,
    slot,
    state: module.state,
    ...(module.chargeTypeId === undefined ? {} : { charge: { type_id: module.chargeTypeId } }),
    ...toEngineMutation(module.typeId, module.mutation, mutaplasmids),
  };
}

function launchFighters(fitting: Fitting): FitItem[] {
  const fighters = fitting.fighters ?? [];
  const tubes = fighterTubes(fighters);
  return fighters.map((fighter, index): FitItem => {
    const tube = tubes[index];
    return tube !== null
      ? {
          type_id: fighter.typeId,
          slot: { type: 'fighter_tube', index: tube },
          quantity: fighter.quantity,
          state: 'active',
        }
      : {
          type_id: fighter.typeId,
          slot: { type: 'fighter_bay' },
          quantity: fighter.quantity,
          state: 'offline',
        };
  });
}

/**
 * Implants or boosters, each in its own EVE slot as `slotOf` knows it; the
 * engine checks the number against the item's slot, so a lone slot-10 implant
 * given its list position (1) reads as "in a slot it can't use". One `slotOf`
 * does not know takes the lowest slot no known item holds, from
 * `SLOT_INDEX_START`, so it never reads as sharing a known item's slot.
 */
function slottedItems(
  typeIds: readonly number[],
  slotType: 'implant' | 'booster',
  slotOf: SlotOf | null,
  extra?: (typeId: number) => Pick<FitItem, 'booster_side_effects'>
): FitItem[] {
  const knownSlot = (typeId: number) => {
    const known = slotOf?.(typeId);
    return known?.kind === slotType ? known.slot : undefined;
  };
  const taken = new Set(typeIds.map(knownSlot).filter((slot) => slot !== undefined));
  let next = SLOT_INDEX_START;
  return typeIds.map((typeId) => {
    let index = knownSlot(typeId);
    if (index === undefined) {
      while (taken.has(next)) next++;
      index = next++;
    }
    return {
      type_id: typeId,
      slot: { type: slotType, index },
      state: 'online',
      ...extra?.(typeId),
    };
  });
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
 *
 * `mutaplasmids`: see `toEngineMutation`. `slotOf`: see `slottedItems`.
 */
export function fittingToDogmaFit(
  fitting: Fitting,
  profile: PilotProfile,
  damageProfile?: DamageProfile,
  mutaplasmids: MutaplasmidLookup | null = null,
  slotOf: SlotOf | null = null
): Fit {
  const items: FitItem[] = [
    ...fitting.modules.map((module) => moduleToFitItem(module, mutaplasmids)),
    ...fitting.drones.map((drone): FitItem => ({
      type_id: drone.typeId,
      slot: { type: 'drone_bay' },
      quantity: drone.quantity,
      // Engine treats a drone given 'online' as launched; its in-bay state is
      // 'offline', so a bay stack ('online' here) goes in as that.
      state: drone.state === 'active' ? 'active' : 'offline',
      ...toEngineMutation(drone.typeId, drone.mutation, mutaplasmids),
    })),
    // Launched squadrons take the tubes in order; the rest wait in the bay.
    ...launchFighters(fitting),
    ...fitting.cargo.map((item): FitItem => ({
      type_id: item.typeId,
      slot: { type: 'cargo' },
      quantity: item.quantity,
      state: 'offline',
    })),
    ...slottedItems(profile.implantTypeIds, 'implant', slotOf),
    // Only the side effects the pilot switched on, and only each booster's
    // own; an empty array is the engine's own "none"
    // (`FitItem.booster_side_effects`'s doc).
    ...slottedItems(profile.boosterTypeIds, 'booster', slotOf, (typeId) => ({
      booster_side_effects: sideEffectsSwitchedOn(typeId, profile.boosterSideEffects),
    })),
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
