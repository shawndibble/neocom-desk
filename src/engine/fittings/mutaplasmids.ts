/**
 * Mutaplasmids and mutated (abyssal) items, pure (GLOSSARY.md **Mutated
 * module**, **Mutaplasmid**, **Roll**, **Abyssal type**). Reads the baked
 * `public/data/mutaplasmids.json` shape (`MutaplasmidData`) handed in by the
 * feature layer (`features/abyssal/mutaplasmidData.ts` loads it); nothing here
 * fetches.
 *
 * A mutaplasmid applied to a base module makes one abyssal type; the base
 * decides the starting attributes and the mutaplasmid which of them roll and
 * how far. Many bases share one abyssal type (every heavy neutralizer becomes
 * the Heavy Abyssal Energy Neutralizer), so the abyssal type alone never
 * names its base — that is why an abyssal item with no `ItemMutation` is
 * `'baseUnknown'`.
 */
import type { MutaplasmidAttributeRange, MutaplasmidData } from '@/sde/types';
import type { Fitting, ItemMutation } from './types';

/** One mutaplasmid, as the lookup hands it out. */
export interface Mutaplasmid {
  typeId: number;
  /** The abyssal type it makes. */
  resultTypeId: number;
  /** The base types it applies to, ascending. */
  baseTypeIds: readonly number[];
  /** What it rolls: multiplier ranges on the base's own value, by attribute id ascending. */
  attributes: readonly MutaplasmidAttributeRange[];
}

/** An attribute's roll range in absolute values, `min <= max`. */
export interface RollRange {
  min: number;
  max: number;
  highIsGood: boolean;
}

export interface MutaplasmidLookup {
  /** An abyssal (mutated) type: what some mutaplasmid produces. */
  isAbyssalType(typeId: number): boolean;
  mutaplasmid(typeId: number): Mutaplasmid | undefined;
  /** Every mutaplasmid that applies to this base type, by type id. Empty for a type no mutaplasmid takes. */
  mutaplasmidsForBase(baseTypeId: number): readonly Mutaplasmid[];
  /** Every mutaplasmid that produces this abyssal type, by type id. */
  mutaplasmidsForResult(resultTypeId: number): readonly Mutaplasmid[];
  /** The abyssal type `mutaplasmid` makes out of `base`, or null when it does not apply to it. */
  resultingType(baseTypeId: number, mutaplasmidTypeId: number): number | null;
  /**
   * The absolute range `attributeId` rolls in under `mutaplasmidTypeId`,
   * given the base type's own value of it; null when that mutaplasmid does
   * not roll it.
   */
  rollRange(mutaplasmidTypeId: number, attributeId: number, baseValue: number): RollRange | null;
  /** Dogma attribute id by internal name (`capacitorNeed`), for any attribute a mutaplasmid rolls. */
  attributeId(name: string): number | undefined;
  /** Internal name (`capacitorNeed`) by dogma attribute id, for any attribute a mutaplasmid rolls. */
  attributeName(attributeId: number): string | undefined;
}

export function mutaplasmidLookup(data: MutaplasmidData): MutaplasmidLookup {
  const byType = new Map<number, Mutaplasmid>();
  const byBase = new Map<number, Mutaplasmid[]>();
  const byResult = new Map<number, Mutaplasmid[]>();
  const push = (map: Map<number, Mutaplasmid[]>, key: number, m: Mutaplasmid) => {
    const list = map.get(key);
    if (list) list.push(m);
    else map.set(key, [m]);
  };
  const ids = Object.keys(data.mutaplasmids)
    .map(Number)
    .sort((a, b) => a - b);
  for (const typeId of ids) {
    const entry = data.mutaplasmids[typeId]!;
    const m: Mutaplasmid = {
      typeId,
      resultTypeId: entry.result,
      baseTypeIds: entry.bases,
      attributes: entry.attributes,
    };
    byType.set(typeId, m);
    push(byResult, entry.result, m);
    for (const base of entry.bases) push(byBase, base, m);
  }
  const abyssal = new Set(data.abyssalTypeIds);
  const nameById = new Map(Object.entries(data.attributeNames).map(([id, n]) => [Number(id), n]));
  const idByName = new Map([...nameById].map(([id, n]) => [n, id]));

  return {
    isAbyssalType: (typeId) => abyssal.has(typeId),
    mutaplasmid: (typeId) => byType.get(typeId),
    mutaplasmidsForBase: (baseTypeId) => byBase.get(baseTypeId) ?? [],
    mutaplasmidsForResult: (resultTypeId) => byResult.get(resultTypeId) ?? [],
    resultingType(baseTypeId, mutaplasmidTypeId) {
      const m = byType.get(mutaplasmidTypeId);
      return m && m.baseTypeIds.includes(baseTypeId) ? m.resultTypeId : null;
    },
    rollRange(mutaplasmidTypeId, attributeId, baseValue) {
      const range = byType.get(mutaplasmidTypeId)?.attributes.find((a) => a.id === attributeId);
      if (!range) return null;
      const a = baseValue * range.min;
      const b = baseValue * range.max;
      return { min: Math.min(a, b), max: Math.max(a, b), highIsGood: range.highIsGood };
    },
    attributeId: (name) => idByName.get(name),
    attributeName: (attributeId) => nameById.get(attributeId),
  };
}

/**
 * How good a roll is, 0 (worst) to 1 (best), in the attribute's own direction —
 * a high activation cost is a bad roll. Clamped to the range; a range with
 * no width reads as best.
 */
export function rollQuality(value: number, range: RollRange): number {
  const width = range.max - range.min;
  if (width <= 0) return 1;
  const t = Math.min(1, Math.max(0, (value - range.min) / width));
  return range.highIsGood ? t : 1 - t;
}

/**
 * `mutation` made legal for an item of `typeId`: the mutaplasmid exists,
 * applies to the base and makes `typeId`, and only attributes that
 * mutaplasmid rolls survive (finite values only). Null when the three do not
 * belong together. Every place a mutation enters the app runs it through
 * this, since the engine takes any attribute it is handed as the item's own.
 */
export function normaliseMutation(
  typeId: number,
  mutation: ItemMutation,
  lookup: MutaplasmidLookup
): ItemMutation | null {
  if (lookup.resultingType(mutation.baseTypeId, mutation.mutaplasmidTypeId) !== typeId) return null;
  const rolled = new Set(
    lookup.mutaplasmid(mutation.mutaplasmidTypeId)!.attributes.map((a) => a.id)
  );
  const attributes: Record<number, number> = {};
  for (const [id, value] of Object.entries(mutation.attributes)) {
    const attributeId = Number(id);
    if (rolled.has(attributeId) && Number.isFinite(value)) attributes[attributeId] = value;
  }
  return {
    baseTypeId: mutation.baseTypeId,
    mutaplasmidTypeId: mutation.mutaplasmidTypeId,
    attributes,
  };
}

/**
 * `fitting` with every mutation run through `normaliseMutation`: rolls cut to
 * the mutaplasmid's own, and a mutation that doesn't belong to its item (a
 * forged share code's, say) dropped. The same Fitting, by reference, when
 * nothing changes. For a Fitting from a source that wasn't checked against
 * the data — a share code is checked for shape only.
 */
export function normaliseFittingMutations(fitting: Fitting, lookup: MutaplasmidLookup): Fitting {
  let changed = false;
  const clean = <T extends { typeId: number; mutation?: ItemMutation }>(item: T): T => {
    if (!item.mutation) return item;
    const mutation = normaliseMutation(item.typeId, item.mutation, lookup);
    const same =
      mutation !== null &&
      Object.keys(mutation.attributes).length === Object.keys(item.mutation.attributes).length;
    if (same) return item;
    changed = true;
    const next = { ...item };
    if (mutation) next.mutation = mutation;
    else delete next.mutation;
    return next;
  };
  const modules = fitting.modules.map(clean);
  const drones = fitting.drones.map(clean);
  return changed ? { ...fitting, modules, drones } : fitting;
}

/** The fields of ESI's `GET /dogma/dynamic/items/{type_id}/{item_id}/` this reads. */
export interface DynamicItemAttributes {
  source_type_id: number;
  mutator_type_id: number;
  dogma_attributes: readonly { attribute_id: number; value: number }[];
}

/**
 * An abyssal item's `ItemMutation` from ESI's dynamic item: its base, its
 * mutaplasmid, and — out of the full attribute set ESI sends — only the
 * attributes that mutaplasmid rolls. Null when the item does not match
 * `typeId` or the data this build carries.
 */
export function mutationFromDynamicItem(
  typeId: number,
  item: DynamicItemAttributes,
  lookup: MutaplasmidLookup
): ItemMutation | null {
  return normaliseMutation(
    typeId,
    {
      baseTypeId: item.source_type_id,
      mutaplasmidTypeId: item.mutator_type_id,
      attributes: Object.fromEntries(item.dogma_attributes.map((a) => [a.attribute_id, a.value])),
    },
    lookup
  );
}

/**
 * Where a fitted item stands on rolls — what the UI badges:
 * - `'none'`: not an abyssal type.
 * - `'rolled'`: base, mutaplasmid and rolls known; the engine states it exactly.
 * - `'rollsUnknown'`: base and mutaplasmid known, rolls not (an EFT block with
 *   no attribute line). The engine states the base module's own values.
 * - `'baseUnknown'`: an abyssal type with no mutation at all — from a
 *   killmail, an In-game Fitting or a bare `Abyssal X` EFT line, none of
 *   which carry one. The engine knows nothing of it but its slot, so it adds
 *   no CPU, powergrid or effect to the stats (decision
 *   `docs/context/decisions/*-mutated-module-rolls-in-share-code-v3.md`).
 */
export type MutationStatus = 'none' | 'rolled' | 'rollsUnknown' | 'baseUnknown';

export function mutationStatus(
  item: { typeId: number; mutation?: ItemMutation },
  lookup: MutaplasmidLookup
): MutationStatus {
  if (!lookup.isAbyssalType(item.typeId)) return 'none';
  if (!item.mutation) return 'baseUnknown';
  return Object.keys(item.mutation.attributes).length === 0 ? 'rollsUnknown' : 'rolled';
}

/**
 * `item` re-typed as `typeId`, its mutation dropped unless the type stays the
 * same: a swapped-in variant is a different item, and a stale mutation would
 * have the engine apply one module's rolls to another.
 */
export function withoutMutation<T extends { typeId: number; mutation?: ItemMutation }>(
  item: T,
  typeId: number
): T {
  if (item.typeId === typeId) return item;
  const next = { ...item, typeId };
  delete next.mutation;
  return next;
}
