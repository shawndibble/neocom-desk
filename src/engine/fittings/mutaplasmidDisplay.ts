/**
 * Mutaplasmid rolls as Item Detail shows them, pure: absolute roll ranges
 * per mutaplasmid for one base module, a mutaplasmid's own ranges as ±% of
 * the base value, and a Mutated module's rolls against its base.
 *
 * Every value is in the unit the game shows it in (`attributeUnits.ts`): a
 * duration in seconds, a resonance as a resistance. A conversion that runs
 * backwards (a resonance of 0.6 is a 40% resistance) re-orders the range and
 * flips its direction, so "higher is better" always describes the figures on
 * screen.
 */
import { displayAttributeValue } from './attributeUnits';
import type { Mutaplasmid, MutaplasmidLookup, RollRange } from './mutaplasmids';
import { rollRows } from './mutationEdit';
import type { ItemMutation } from './types';

/** An attribute's roll range as shown, `low <= high`. */
export interface DisplayRange {
  low: number;
  high: number;
  /** A higher shown figure is the better roll. */
  highIsGood: boolean;
}

/** Dogma unit id by attribute id (`attributes.json`'s `unitId`); undefined leaves a value as it is. */
export type UnitIdOf = (attributeId: number) => number | undefined;

function shown(value: number, unitId: number | undefined): number {
  return displayAttributeValue(value, unitId, null).value;
}

/** `range` in the unit the game shows, re-ordered and its direction flipped where the conversion runs backwards. */
export function displayRollRange(range: RollRange, unitId?: number): DisplayRange {
  const a = shown(range.min, unitId);
  const b = shown(range.max, unitId);
  const reversed = a > b;
  return {
    low: Math.min(a, b),
    high: Math.max(a, b),
    highIsGood: reversed ? !range.highIsGood : range.highIsGood,
  };
}

/** The mutaplasmids that make `resultTypeId` out of `baseTypeId`, by type id. */
export function mutaplasmidsMaking(
  lookup: MutaplasmidLookup,
  resultTypeId: number,
  baseTypeId: number
): Mutaplasmid[] {
  return lookup
    .mutaplasmidsForResult(resultTypeId)
    .filter((m) => m.baseTypeIds.includes(baseTypeId));
}

/** One rolled attribute across several mutaplasmids, for one base module. */
export interface StrainRangeRow {
  attributeId: number;
  /** The base module's own value, as shown. */
  base: number;
  /** One per mutaplasmid, in the order asked; null where that one doesn't roll the attribute. */
  ranges: (DisplayRange | null)[];
  /** The row's direction: its first range's. */
  highIsGood: boolean;
}

/**
 * The absolute range each of `mutaplasmidTypeIds` rolls each attribute in,
 * given the base module's own attribute values: one row per attribute any of
 * them rolls, by attribute id. An attribute the base carries no value for is
 * left out — its range can't be stated.
 */
export function strainRangeRows(
  lookup: MutaplasmidLookup,
  mutaplasmidTypeIds: readonly number[],
  baseAttributes: ReadonlyMap<number, number>,
  unitIdOf: UnitIdOf
): StrainRangeRow[] {
  const attributeIds = new Set<number>();
  for (const id of mutaplasmidTypeIds) {
    for (const a of lookup.mutaplasmid(id)?.attributes ?? []) attributeIds.add(a.id);
  }
  const rows: StrainRangeRow[] = [];
  for (const attributeId of [...attributeIds].sort((a, b) => a - b)) {
    const baseValue = baseAttributes.get(attributeId);
    if (baseValue === undefined) continue;
    const unitId = unitIdOf(attributeId);
    const ranges = mutaplasmidTypeIds.map((id) => {
      const range = lookup.rollRange(id, attributeId, baseValue);
      return range ? displayRollRange(range, unitId) : null;
    });
    const first = ranges.find((r) => r !== null)!;
    rows.push({
      attributeId,
      base: shown(baseValue, unitId),
      ranges,
      highIsGood: first.highIsGood,
    });
  }
  return rows;
}

/** A mutaplasmid's roll on one attribute as a percentage of the base value. */
export interface MultiplierRow {
  attributeId: number;
  /** Signed percent change at the lowest multiplier (−20 for ×0.8). */
  lowPct: number;
  highPct: number;
  /** A higher raw value is better — the multiplier's direction, not the shown figure's. */
  highIsGood: boolean;
  /**
   * The game shows this attribute backwards (a resonance as a resistance), so
   * a higher multiplier is a lower shown figure. The percentages stay raw: the
   * shown figure's change depends on the base value.
   */
  shownBackwards: boolean;
}

/** `mutaplasmid`'s rolls as signed percentages of the base module's own raw value, by attribute id. */
export function multiplierPercentRows(
  mutaplasmid: Mutaplasmid,
  unitIdOf: UnitIdOf
): MultiplierRow[] {
  return mutaplasmid.attributes.map((a) => {
    const unitId = unitIdOf(a.id);
    return {
      attributeId: a.id,
      lowPct: (Math.min(a.min, a.max) - 1) * 100,
      highPct: (Math.max(a.min, a.max) - 1) * 100,
      highIsGood: a.highIsGood,
      shownBackwards: shown(1, unitId) > shown(2, unitId),
    };
  });
}

/** One of a Mutated module's rolls against its base. */
export interface RolledAttributeRow {
  attributeId: number;
  /** The base module's own value, as shown. */
  base: number;
  /** The item's rolled value, as shown. */
  rolled: number;
  /** What the mutaplasmid could have rolled, as shown. */
  range: DisplayRange;
  /** 0 (worst roll) to 1 (best), in the attribute's own direction (`rollQuality`). */
  quality: number;
}

/**
 * A Mutated module's rolls (`mutation`) beside its base module's values, one row
 * per attribute the mutaplasmid rolls (`rollRows`), by its order. A roll the item
 * doesn't carry, or one the base has no value for, is left out.
 */
export function rolledAttributeRows(
  mutation: ItemMutation,
  lookup: MutaplasmidLookup,
  baseAttributes: ReadonlyMap<number, number>,
  unitIdOf: UnitIdOf
): RolledAttributeRow[] {
  return rollRows(
    mutation.mutaplasmidTypeId,
    mutation.attributes,
    (id) => baseAttributes.get(id),
    lookup
  )
    .filter((row) => row.rolled)
    .map(({ attributeId, range, value, quality }) => {
      const unitId = unitIdOf(attributeId);
      return {
        attributeId,
        base: shown(baseAttributes.get(attributeId)!, unitId),
        rolled: shown(value, unitId),
        range: displayRollRange(range, unitId),
        quality,
      };
    });
}

/**
 * Which base module an abyssal type's roll table starts on: the Tech II base
 * when there is one (the base most pilots roll), else the first by name.
 * Null with no base.
 */
export function defaultBaseTypeId(
  bases: readonly { typeId: number; name: string }[]
): number | null {
  const techTwo = bases.find((b) => / II$/.test(b.name));
  if (techTwo) return techTwo.typeId;
  const sorted = [...bases].sort((a, b) => a.name.localeCompare(b.name));
  return sorted[0]?.typeId ?? null;
}
