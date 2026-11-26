import {
  normaliseMutation,
  rollQuality,
  withoutMutation,
  type MutaplasmidLookup,
  type RollRange,
} from './mutaplasmids';
import type { Fitting, FittingModule, FittingSlotKind, ItemMutation } from './types';

export type BaseValue = (attributeId: number) => number | undefined;

export function clampRoll(value: number, range: RollRange): number {
  return Math.min(range.max, Math.max(range.min, value));
}

export function rollAtQuality(quality: number, range: RollRange): number {
  const q = Math.min(1, Math.max(0, quality));
  const t = range.highIsGood ? q : 1 - q;
  return range.min + t * (range.max - range.min);
}

function usableRanges(
  mutaplasmidTypeId: number,
  baseValue: BaseValue,
  lookup: MutaplasmidLookup
): { attributeId: number; base: number; range: RollRange }[] {
  const mutaplasmid = lookup.mutaplasmid(mutaplasmidTypeId);
  if (!mutaplasmid) return [];
  return mutaplasmid.attributes.flatMap(({ id }) => {
    const base = baseValue(id);
    if (base === undefined || !Number.isFinite(base) || base === 0) return [];
    const range = lookup.rollRange(mutaplasmidTypeId, id, base);
    return range ? [{ attributeId: id, base, range }] : [];
  });
}

export function startingRolls(
  mutaplasmidTypeId: number,
  baseValue: BaseValue,
  lookup: MutaplasmidLookup
): Record<number, number> {
  const rolls: Record<number, number> = {};
  for (const { attributeId, base, range } of usableRanges(mutaplasmidTypeId, baseValue, lookup)) {
    rolls[attributeId] = clampRoll(base, range);
  }
  return rolls;
}

export interface RollRow {
  attributeId: number;
  range: RollRange;
  value: number;
  quality: number;
  rolled: boolean;
}

export function rollRows(
  mutaplasmidTypeId: number,
  rolls: Readonly<Record<number, number>>,
  baseValue: BaseValue,
  lookup: MutaplasmidLookup
): RollRow[] {
  return usableRanges(mutaplasmidTypeId, baseValue, lookup).map(({ attributeId, base, range }) => {
    const roll = rolls[attributeId];
    const value = roll ?? clampRoll(base, range);
    return {
      attributeId,
      range,
      value,
      quality: rollQuality(value, range),
      rolled: roll !== undefined,
    };
  });
}

function updateModuleAt(
  fitting: Fitting,
  slot: FittingSlotKind,
  slotIndex: number,
  update: (module: FittingModule) => FittingModule
): Fitting {
  let changed = false;
  const modules = fitting.modules.map((module) => {
    if (module.slot !== slot || module.slotIndex !== slotIndex) return module;
    const next = update(module);
    if (next !== module) changed = true;
    return next;
  });
  return changed ? { ...fitting, modules } : fitting;
}

export function setModuleMutation(
  fitting: Fitting,
  slot: FittingSlotKind,
  slotIndex: number,
  mutation: ItemMutation | null,
  lookup: MutaplasmidLookup
): Fitting {
  return updateModuleAt(fitting, slot, slotIndex, (module) => {
    if (mutation === null) {
      return module.mutation ? withoutMutation(module, module.mutation.baseTypeId) : module;
    }
    const typeId = lookup.resultingType(mutation.baseTypeId, mutation.mutaplasmidTypeId);
    if (typeId === null) return module;
    const clean = normaliseMutation(typeId, mutation, lookup);
    return clean ? { ...module, typeId, mutation: clean } : module;
  });
}

export function setModuleRoll(
  fitting: Fitting,
  slot: FittingSlotKind,
  slotIndex: number,
  attributeId: number,
  value: number,
  baseValue: BaseValue,
  lookup: MutaplasmidLookup
): Fitting {
  return updateModuleAt(fitting, slot, slotIndex, (module) => {
    const mutation = module.mutation;
    if (!mutation) return module;
    const target = usableRanges(mutation.mutaplasmidTypeId, baseValue, lookup).find(
      (entry) => entry.attributeId === attributeId
    );
    if (!target || !Number.isFinite(value)) return module;
    return {
      ...module,
      mutation: {
        ...mutation,
        attributes: {
          ...startingRolls(mutation.mutaplasmidTypeId, baseValue, lookup),
          ...mutation.attributes,
          [attributeId]: clampRoll(value, target.range),
        },
      },
    };
  });
}

export const MUTAPLASMID_STRAINS = [
  'decayed',
  'gravid',
  'unstable',
  'glorified',
  'exigent',
  'radical',
  'other',
] as const;
export type MutaplasmidStrain = (typeof MUTAPLASMID_STRAINS)[number];

export function mutaplasmidStrain(name: string): MutaplasmidStrain {
  const first = name.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  return (MUTAPLASMID_STRAINS as readonly string[]).includes(first)
    ? (first as MutaplasmidStrain)
    : 'other';
}

export function groupMutaplasmidsByStrain(
  typeIds: readonly number[],
  nameOf: (typeId: number) => string
): { strain: MutaplasmidStrain; typeIds: number[] }[] {
  const byStrain = new Map<MutaplasmidStrain, number[]>();
  for (const typeId of typeIds) {
    const strain = mutaplasmidStrain(nameOf(typeId));
    byStrain.set(strain, [...(byStrain.get(strain) ?? []), typeId]);
  }
  return MUTAPLASMID_STRAINS.flatMap((strain) => {
    const ids = byStrain.get(strain);
    if (!ids) return [];
    return [{ strain, typeIds: ids.sort((a, b) => nameOf(a).localeCompare(nameOf(b))) }];
  });
}
