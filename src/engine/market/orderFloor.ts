import {
  relistBreakEvenPrice,
  relistBreakEvenPriceAtBrokerPct,
  salesTaxPct,
} from '@/engine/industry/fees';

export interface OrderFloorInputs {
  unitCost: number;
  remainingQuantity: number;
  accountingLevel: number;
  brokerRelationsLevel: number;
  advancedBrokerRelationsLevel: number;
  factionStanding?: number;
  corpStanding?: number;
  feeDiscountFactor?: number;
  structureBrokerPct?: number;
}

export interface OrderFloor {
  feeDiscountFactor?: number;
  relist: number;
  fill: number;
}

export function orderFloor(inputs: OrderFloorInputs): OrderFloor | null {
  const {
    unitCost,
    remainingQuantity,
    accountingLevel,
    brokerRelationsLevel,
    advancedBrokerRelationsLevel,
    factionStanding,
    corpStanding,
    feeDiscountFactor,
    structureBrokerPct,
  } = inputs;

  if (!Number.isFinite(unitCost) || unitCost <= 0) return null;
  if (!Number.isFinite(remainingQuantity) || remainingQuantity <= 0) return null;

  const relist =
    structureBrokerPct === undefined
      ? relistBreakEvenPrice(
          unitCost * remainingQuantity,
          remainingQuantity,
          accountingLevel,
          brokerRelationsLevel,
          advancedBrokerRelationsLevel,
          factionStanding,
          corpStanding,
          feeDiscountFactor
        )
      : relistBreakEvenPriceAtBrokerPct(
          unitCost * remainingQuantity,
          remainingQuantity,
          accountingLevel,
          structureBrokerPct,
          advancedBrokerRelationsLevel
        );
  const taxFactor = structureBrokerPct === undefined ? feeDiscountFactor : undefined;
  const tax = salesTaxPct(accountingLevel, taxFactor);
  const fill = unitCost / (1 - tax / 100);

  return { relist: relist as number, fill, feeDiscountFactor: taxFactor };
}
