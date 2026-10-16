/**
 * Editing a fitted module's mutation (GLOSSARY.md **Mutated module**,
 * **Mutaplasmid**, **Roll**), pure: what the module dialog's Mutation
 * section does. A mutaplasmid's ranges are multipliers on the base module's
 * own values (`MutaplasmidLookup.rollRange` turns them absolute); the rolls
 * an `ItemMutation` carries are absolute, so every edit here needs the base
 * module's own attribute values, which the feature layer reads
 * (`baseValue`).
 *
 * A rolled attribute the base does not carry (or carries as 0) has no
 * range to roll in, so it is left out everywhere here rather than shown as
 * a slider that cannot move.
 */
import {
  normaliseMutation,
  rollQuality,
  type MutaplasmidLookup,
  type RollRange,
} from './mutaplasmids';
import type { Fitting, FittingModule, FittingSlotKind, ItemMutation } from './types';

/** The base module's own value of a dogma attribute; undefined when it has none. */
export type BaseValue = (attributeId: number) => number | undefined;

/** `value` inside `range`: one outside it moves to the nearer edge. */
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
 * The rolls a freshly applied mutaplasmid starts from: the base's own value
 * of each attribute it rolls, clamped into the range (a few ranges leave
 * ×1 out). A starting point the pilot then moves, so the item reads as
 * rolled from the first edit rather than as rolls unknown.
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
 * Sets or clears the mutation of the module at `slot`/`slotIndex`.
 *
 * - A mutation makes the module the abyssal type its base and mutaplasmid
 *   produce, rolls cut to the mutaplasmid's own (`normaliseMutation`); an
 *   abyssal module of unknown base keeps its type and gains them. A
 *   mutaplasmid that does not take the base changes nothing.
 * - `null` reverts a mutated module to its base type. State and charge stay
 *   either way; the engine lowers what the new type can't reach.
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
      if (!module.mutation) return module;
      const next = { ...module, typeId: module.mutation.baseTypeId };
      delete next.mutation;
      return next;
    }
    const typeId = lookup.resultingType(mutation.baseTypeId, mutation.mutaplasmidTypeId);
    if (typeId === null) return module;
    const clean = normaliseMutation(typeId, mutation, lookup);
    return clean ? { ...module, typeId, mutation: clean } : module;
  });
}

/**
 * Sets one roll of a mutated module, clamped into its range. Rolls the
 * mutation lacks are filled from the base (`startingRolls`), so a module
 * whose rolls were unknown states one consistent set once the pilot moves
 * any of them. A module with no mutation, or an attribute its mutaplasmid
 * does not roll, changes nothing.
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
