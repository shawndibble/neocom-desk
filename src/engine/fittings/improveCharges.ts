/**
 * Improve's "weapons have no charge" check and its one-click fix: which
 * turret and launcher groups hold no charge, and the best charge to load in
 * each. The ranking is the Charge Picker's (`quickPicks`), not a new one.
 */
import { chargeScore, quickPicks, type ChargeChoice } from './chargeChoice';
import type { ModuleAt } from './fittingEdit';
import type { Fitting } from './types';

/** One weapon group as the Charge Picker lists it (`WeaponChargeGroup`'s share). */
export interface ChargeGroup {
  moduleTypeId: number;
  /** Some charge deals damage. */
  isWeapon: boolean;
  choices: readonly ChargeChoice[];
}

/** `weapon` when the empty ones are of more than one kind. */
export type UnloadedKind = 'launcher' | 'turret' | 'weapon';

export interface UnloadedWeapons {
  count: number;
  kind: UnloadedKind;
}

/** One load: `chargeTypeId` into the modules at `at`, out of the cargo or not. */
export interface ChargeLoadStep {
  chargeTypeId: number;
  fromCargo: boolean;
  at: ModuleAt[];
}

/** A launcher's charges fly (no falloff); a gun's are range-and-falloff ammo. */
const kindOf = (group: ChargeGroup): Exclude<UnloadedKind, 'weapon'> =>
  group.choices.every((c) => c.falloff === 0) ? 'launcher' : 'turret';

function emptyModulesOf(fitting: Fitting, group: ChargeGroup): ModuleAt[] {
  // Offline guns aren't firing, so the stats panel doesn't count them either.
  if (!group.isWeapon || group.choices.length === 0) return [];
  return fitting.modules
    .filter(
      (m) =>
        m.typeId === group.moduleTypeId && m.chargeTypeId === undefined && m.state !== 'offline'
    )
    .map(({ slot, slotIndex }) => ({ slot, slotIndex }));
}

/** How many weapons hold no charge; null when none, or none take one. */
export function unloadedWeapons(
  fitting: Fitting,
  groups: readonly ChargeGroup[]
): UnloadedWeapons | null {
  let count = 0;
  const kinds = new Set<UnloadedKind>();
  for (const group of groups) {
    const empty = emptyModulesOf(fitting, group).length;
    if (empty === 0) continue;
    count += empty;
    kinds.add(kindOf(group));
  }
  if (count === 0) return null;
  return { count, kind: kinds.size === 1 ? [...kinds][0]! : 'weapon' };
}

/**
 * For each group with empty weapons: the usable charge the cargo already
 * holds (most damage first), else the Charge Picker's top pick.
 */
export function loadBestCharges(
  fitting: Fitting,
  groups: readonly ChargeGroup[]
): ChargeLoadStep[] {
  const steps: ChargeLoadStep[] = [];
  for (const group of groups) {
    const at = emptyModulesOf(fitting, group);
    if (at.length === 0) continue;
    const held = group.choices
      .filter((c) => c.cargo > 0 && !c.skillMissing)
      .reduce<ChargeChoice | null>(
        (best, c) => (best === null || chargeScore(c, null) > chargeScore(best, null) ? c : best),
        null
      );
    if (held) {
      steps.push({ chargeTypeId: held.typeId, fromCargo: true, at });
      continue;
    }
    const top = quickPicks(group.choices, null)?.maxDamage;
    if (top) steps.push({ chargeTypeId: top.typeId, fromCargo: false, at });
  }
  return steps;
}
