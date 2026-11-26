import type { MaterialCostLine } from './types';

export const GAS_DECOMPRESSION_YIELD = 0.8;

type CompressedByRaw = Readonly<Record<number | string, number>>;

function compressedUnitsFor(rawQuantity: number, yieldRate: number): number {
  return Math.ceil(rawQuantity / yieldRate - 1e-9);
}

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
  rawUnits: number;
  compressedUnits: number;
  pricedRawUnits: number;
  rawCost: number;
  compressedCost: number;
  rawVolume: number;
  compressedVolume: number;
  priced: boolean;
}

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
