/**
 * Buying gas compressed (issue #6395): a Build Plan's raw gas lines swapped for
 * their "Compressed" twins, sized so decompressing them returns the raw
 * quantity the plan needs. Compressed gas hauls at a tenth of the volume, at a
 * somewhat higher price.
 *
 * Pure: the raw to compressed map, yield, prices and volumes arrive as inputs.
 */
import type { MaterialCostLine } from './types';

/**
 * Decompression yield assumed for compressed gas: CCP's stated base of 80% at
 * a structure's reprocessing service, before the Gas Decompression Efficiency
 * skill (+1% a level) and any structure bonus. Gas cannot be decompressed in
 * an NPC station. The UI labels it as an assumption, never silently baked in.
 */
export const GAS_DECOMPRESSION_YIELD = 0.8;

type CompressedByRaw = Readonly<Record<number | string, number>>;

/** Whole compressed units whose decompression returns at least `rawQuantity`. */
function compressedUnitsFor(rawQuantity: number, yieldRate: number): number {
  // The epsilon absorbs float error (12 / 0.8 is not exactly 15) so an exact
  // fit is not billed one unit more.
  return Math.ceil(rawQuantity / yieldRate - 1e-9);
}

/**
 * The lines with every raw gas line still to be bought swapped for its
 * compressed twin. Any other line, and a gas line with nothing remaining, is
 * returned as it was.
 */
export function compressGasLines<T extends MaterialCostLine>(
  materials: readonly T[],
  compressedByRaw: CompressedByRaw,
  yieldRate: number
): T[] {
  return materials.map((material) => {
    const compressedId = compressedByRaw[material.typeID];
    if (compressedId === undefined || material.remainingQuantity <= 0) return material;
    return {
      ...material,
      typeID: compressedId,
      remainingQuantity: compressedUnitsFor(material.remainingQuantity, yieldRate),
    };
  });
}

export interface GasRouteComparison {
  /** Raw units the plan needs, priced or not. */
  rawUnits: number;
  compressedUnits: number;
  /** The raw units behind the cost and volume totals: the denominator for a per-raw-unit figure. */
  pricedRawUnits: number;
  rawCost: number;
  compressedCost: number;
  /** m3 hauled either way. */
  rawVolume: number;
  compressedVolume: number;
  /** False when a gas line had no price or volume on either side: the totals are then partial. */
  priced: boolean;
}

/**
 * Raw against compressed for the plan's gas, or null when it has none.
 * A line missing a price or volume marks the result unpriced and adds nothing
 * for it, rather than counting as free.
 */
export function compareGasRoute(
  materials: readonly MaterialCostLine[],
  compressedByRaw: CompressedByRaw,
  yieldRate: number,
  prices: Readonly<Record<number, number>>,
  volumes: Readonly<Record<number, number>>
): GasRouteComparison | null {
  const out: GasRouteComparison = {
    rawUnits: 0,
    compressedUnits: 0,
    pricedRawUnits: 0,
    rawCost: 0,
    compressedCost: 0,
    rawVolume: 0,
    compressedVolume: 0,
    priced: true,
  };
  let any = false;
  for (const material of materials) {
    const compressedId = compressedByRaw[material.typeID];
    if (compressedId === undefined || material.remainingQuantity <= 0) continue;
    any = true;
    const raw = material.remainingQuantity;
    const compressed = compressedUnitsFor(raw, yieldRate);
    out.rawUnits += raw;
    out.compressedUnits += compressed;
    const rawPrice = prices[material.typeID];
    const compressedPrice = prices[compressedId];
    const rawVolume = volumes[material.typeID];
    const compressedVolume = volumes[compressedId];
    if (
      !(rawPrice > 0) ||
      !(compressedPrice > 0) ||
      rawVolume === undefined ||
      compressedVolume === undefined
    ) {
      out.priced = false;
      continue;
    }
    out.pricedRawUnits += raw;
    out.rawCost += raw * rawPrice;
    out.compressedCost += compressed * compressedPrice;
    out.rawVolume += raw * rawVolume;
    out.compressedVolume += compressed * compressedVolume;
  }
  return any ? out : null;
}
