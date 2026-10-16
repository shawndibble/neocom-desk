/**
 * Pure edits for a fitted module's mutation (GLOSSARY.md **Mutated module**,
 * **Mutaplasmid**, **Roll**). Ranges are multipliers on the base's own values
 * but rolls are absolute, so every edit takes `baseValue`. A rolled attribute
 * the base lacks (or has as 0) has no range: left out, not a dead slider.
 */
import {
  normaliseMutation,
  rollQuality,
  withoutMutation,
  type MutaplasmidLookup,
  type RollRange,
} from './mutaplasmids';
import type { Fitting, FittingModule, FittingSlotKind, ItemMutation } from './types';

/** The base module's own value of a dogma attribute; undefined when it has none. */
export type BaseValue = (attributeId: number) => number | undefined;

export function clampRoll(value: number, range: RollRange): number {
  return Math.min(range.max, Math.max(range.min, value));
}

/**
 * The absolute value at `quality` (0 worst, 1 best, clamped) — the
 * inverse of `rollQuality`, so a control can run worst-to-best whichever
 * way the attribute's good direction points.
 */
export function rollAtQuality(quality: number, range: RollRange): number {
  const q = Math.min(1, Math.max(0, quality));
  const t = range.highIsGood ? q : 1 - q;
  return range.min + t * (range.max - range.min);
}

/** The absolute range of each attribute `mutaplasmidTypeId` rolls that the base carries, in its order. */
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

/**
 * A fresh mutaplasmid's rolls: the base's own value per rolled attribute,
 * clamped (a few ranges leave ×1 out), so the item reads as rolled, not rolls unknown.
 */
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

/** One rolled attribute as the Mutation section shows it. */
export interface RollRow {
  attributeId: number;
  /** Absolute, `min <= max`. */
  range: RollRange;
  /** The roll, or the clamped base value where there is none. */
  value: number;
  /** 0 worst to 1 best (`rollQuality`). */
  quality: number;
  /** The value is a roll the mutation carries, not the base's stand-in. */
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

/**
 * A mutation makes the module its resulting abyssal type, rolls cut by
 * `normaliseMutation` (one the base doesn't take changes nothing); `null`
 * reverts it to its base. State and charge stay; the engine lowers what the new type can't reach.
 */
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

/**
 * Sets one roll, clamped. Missing rolls fill from the base (`startingRolls`),
 * so an unknown-rolls module becomes one consistent set on its first move.
 */
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

/** Mutaplasmid strains, in the order the game lists them; `other` for a name none matches. */
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

/**
 * A mutaplasmid's strain, read off its English name's first word ("Gravid
 * Heavy Energy Neutralizer Mutaplasmid"; "Glorified Decayed …" is
 * Glorified). The baked data carries no strain field.
 */
export function mutaplasmidStrain(name: string): MutaplasmidStrain {
  const first = name.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  return (MUTAPLASMID_STRAINS as readonly string[]).includes(first)
    ? (first as MutaplasmidStrain)
    : 'other';
}

/** Mutaplasmids grouped by strain (`MUTAPLASMID_STRAINS` order), names alphabetical within each; empty groups left out. */
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
