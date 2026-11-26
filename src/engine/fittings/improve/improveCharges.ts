import { chargeScore, quickPicks, type ChargeChoice } from '../chargeChoice';
import type { ModuleAt } from '../fittingEdit';
import { isFiring } from '../stats';
import type { Fitting } from '../types';

export interface ChargeGroup {
  moduleTypeId: number;
  isWeapon: boolean;
  choices: readonly ChargeChoice[];
}

export type UnloadedKind = 'launcher' | 'turret' | 'weapon';

export interface UnloadedWeapons {
  count: number;
  kind: UnloadedKind;
}

export interface ChargeLoadStep {
  chargeTypeId: number;
  fromCargo: boolean;
  at: ModuleAt[];
}

const kindOf = (group: ChargeGroup): Exclude<UnloadedKind, 'weapon'> =>
  group.choices.every((c) => c.falloff === 0) ? 'launcher' : 'turret';

function emptyModulesOf(fitting: Fitting, group: ChargeGroup): ModuleAt[] {
  if (!group.isWeapon || group.choices.length === 0) return [];
  return fitting.modules
    .filter(
      (m) => m.typeId === group.moduleTypeId && m.chargeTypeId === undefined && isFiring(m.state)
    )
    .map(({ slot, slotIndex }) => ({ slot, slotIndex }));
}

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

export function assumeCharges(
  fitting: Fitting,
  planned: Fitting,
  steps: readonly ChargeLoadStep[]
): Fitting {
  if (steps.length === 0) return fitting;
  const modules = fitting.modules.map((m) => {
    if (m.chargeTypeId !== undefined) return m;
    const step = steps.find((s) =>
      s.at.some((a) => a.slot === m.slot && a.slotIndex === m.slotIndex)
    );
    if (!step) return m;
    const was = planned.modules.find((p) => p.slot === m.slot && p.slotIndex === m.slotIndex);
    return was?.typeId === m.typeId ? { ...m, chargeTypeId: step.chargeTypeId } : m;
  });
  return { ...fitting, modules };
}
