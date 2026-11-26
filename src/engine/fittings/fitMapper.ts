import type { Fit, FitItem, Slot } from '@eveshipfit/dogma-engine';
import { sideEffectsSwitchedOn } from './boosterSideEffects';
import { fighterTubes } from './inventoryFlags';
import { defaultTacticalMode, tacticalModesFor } from './tacticalModes';
import { normaliseMutation, type MutaplasmidLookup } from './mutaplasmids';
import type { SlotOf } from './implantFinder';
import type { DamageProfile, Fitting, FittingModule, ItemMutation, PilotProfile } from './types';

const SLOT_INDEX_START = 1;

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
      state: drone.state === 'active' ? 'active' : 'offline',
      ...toEngineMutation(drone.typeId, drone.mutation, mutaplasmids),
    })),
    ...launchFighters(fitting),
    ...fitting.cargo.map((item): FitItem => ({
      type_id: item.typeId,
      slot: { type: 'cargo' },
      quantity: item.quantity,
      state: 'offline',
    })),
    ...slottedItems(profile.implantTypeIds, 'implant', slotOf),
    ...slottedItems(profile.boosterTypeIds, 'booster', slotOf, (typeId) => ({
      booster_side_effects: sideEffectsSwitchedOn(typeId, profile.boosterSideEffects),
    })),
  ];

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
