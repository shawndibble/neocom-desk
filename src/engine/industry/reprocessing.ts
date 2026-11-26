export const BASE_STATION_REPROCESSING_RATE = 0.5;

export interface ReprocessingMaterial {
  typeId: number;
  quantity: number;
}

export interface ReprocessingSkills {
  reprocessingLevel: number;
  reprocessingEfficiencyLevel: number;
  specialisationLevel: number;
  stationRate?: number;
  isScrap?: boolean;
  implantBonusPct?: number;
}

export function reprocessingEfficiency({
  reprocessingLevel,
  reprocessingEfficiencyLevel,
  specialisationLevel,
  stationRate = BASE_STATION_REPROCESSING_RATE,
  isScrap = false,
  implantBonusPct = 0,
}: ReprocessingSkills): number {
  if (isScrap) {
    return stationRate * (1 + 0.02 * specialisationLevel);
  }
  return (
    stationRate *
    (1 + 0.03 * reprocessingLevel) *
    (1 + 0.02 * reprocessingEfficiencyLevel) *
    (1 + 0.02 * specialisationLevel) *
    (1 + implantBonusPct / 100)
  );
}

export interface ReprocessingYieldInput {
  portionSize: number;
  materials: readonly ReprocessingMaterial[];
  units: number;
  efficiency: number;
}

export interface ReprocessingYield {
  batches: number;
  unitsRefined: number;
  unitsLeftOver: number;
  outputs: ReprocessingMaterial[];
}

export function reprocessingYield({
  portionSize,
  materials,
  units,
  efficiency,
}: ReprocessingYieldInput): ReprocessingYield {
  if (!(portionSize > 0) || !(units > 0)) {
    return { batches: 0, unitsRefined: 0, unitsLeftOver: Math.max(0, units), outputs: [] };
  }
  const batches = Math.floor(units / portionSize);
  const unitsRefined = batches * portionSize;
  const outputs: ReprocessingMaterial[] = [];
  for (const material of materials) {
    const quantity = Math.floor(material.quantity * batches * efficiency);
    if (quantity > 0) outputs.push({ typeId: material.typeId, quantity });
  }
  return { batches, unitsRefined, unitsLeftOver: units - unitsRefined, outputs };
}

export interface ReprocessingValue {
  total: number;
  pricedAll: boolean;
  unpricedTypeIds: number[];
}

export function reprocessingValue(
  outputs: readonly ReprocessingMaterial[],
  prices: Readonly<Record<number, number>>
): ReprocessingValue {
  let total = 0;
  const unpricedTypeIds: number[] = [];
  for (const output of outputs) {
    const price = prices[output.typeId];
    if (price === undefined || !(price > 0)) {
      unpricedTypeIds.push(output.typeId);
      continue;
    }
    total += price * output.quantity;
  }
  return { total, pricedAll: unpricedTypeIds.length === 0, unpricedTypeIds };
}
