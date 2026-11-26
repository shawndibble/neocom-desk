import { materialCostLines } from '@/engine/industry/sourcing';
import type { HubPrices } from '@/engine/industry/types';
import type { HubAggregate } from '@/market/prices';

export interface RunInput {
  typeID: number;
  quantity: number;
}

export function runInputCost(
  inputs: readonly RunInput[],
  aggregates: ReadonlyMap<number, HubAggregate>
): number | null {
  const sellPrices: HubPrices = {};
  for (const [typeId, aggregate] of aggregates) {
    if (aggregate.sellMin !== null) sellPrices[typeId] = aggregate.sellMin;
  }
  const lines = materialCostLines(
    inputs.map((input) => ({
      typeID: input.typeID,
      baseQuantity: input.quantity,
      quantity: input.quantity,
    })),
    sellPrices
  );
  if (lines.some((line) => line.unpriced)) return null;
  return lines.reduce((sum, line) => sum + line.lineCost, 0);
}

export function marginOnBestSell(
  inputCost: number,
  bestSell: number | null | undefined,
  outputQuantity: number
): number | null {
  if (bestSell == null || bestSell <= 0 || outputQuantity <= 0) return null;
  const revenue = bestSell * outputQuantity;
  return ((revenue - inputCost) / revenue) * 100;
}
