import { MIN_BROKER_FEE_ISK, salesTax } from '@/engine/industry/fees';

export const STRUCTURE_SCC_SURCHARGE_PCT = 0.5;
export const MAX_STRUCTURE_OWNER_PCT = 100;

export function structureBrokerPct(ownerPct: number): number {
  if (!Number.isFinite(ownerPct) || ownerPct < 0) {
    throw new RangeError(`owner fee must be a non-negative number, got ${ownerPct}`);
  }
  return STRUCTURE_SCC_SURCHARGE_PCT + ownerPct;
}

export interface ListingNetInputs {
  gross: number;
  accountingLevel: number;
  brokerPct: number;
}

export function listingNet({ gross, accountingLevel, brokerPct }: ListingNetInputs): number {
  const fee = Math.max(MIN_BROKER_FEE_ISK, (gross * brokerPct) / 100);
  return gross - salesTax(gross, accountingLevel) - fee;
}
