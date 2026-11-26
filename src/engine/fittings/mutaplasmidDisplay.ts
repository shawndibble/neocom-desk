import { displayAttributeValue } from './attributeUnits';
import type { Mutaplasmid, MutaplasmidLookup, RollRange } from './mutaplasmids';
import { rollRows } from './mutationEdit';
import type { ItemMutation } from './types';

export interface DisplayRange {
  low: number;
  high: number;
  highIsGood: boolean;
}

export type UnitIdOf = (attributeId: number) => number | undefined;

function shown(value: number, unitId: number | undefined): number {
  return displayAttributeValue(value, unitId, null).value;
}

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

export function mutaplasmidsMaking(
  lookup: MutaplasmidLookup,
  resultTypeId: number,
  baseTypeId: number
): Mutaplasmid[] {
  return lookup
    .mutaplasmidsForResult(resultTypeId)
    .filter((m) => m.baseTypeIds.includes(baseTypeId));
}

export interface StrainRangeRow {
  attributeId: number;
  base: number;
  ranges: (DisplayRange | null)[];
  highIsGood: boolean;
}

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

export interface MultiplierRow {
  attributeId: number;
  lowPct: number;
  highPct: number;
  highIsGood: boolean;
  shownBackwards: boolean;
}

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

export interface RolledAttributeRow {
  attributeId: number;
  base: number;
  rolled: number;
  range: DisplayRange;
  quality: number;
}

export type RollQualityTone = 'poor' | 'fair' | 'good';

export function rollQualityTone(quality: number): RollQualityTone {
  if (quality < 1 / 3) return 'poor';
  return quality < 2 / 3 ? 'fair' : 'good';
}

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

export function defaultBaseTypeId(
  bases: readonly { typeId: number; name: string }[]
): number | null {
  const techTwo = bases.find((b) => / II$/.test(b.name));
  if (techTwo) return techTwo.typeId;
  const sorted = [...bases].sort((a, b) => a.name.localeCompare(b.name));
  return sorted[0]?.typeId ?? null;
}
