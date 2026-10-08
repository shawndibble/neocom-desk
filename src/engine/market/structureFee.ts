/**
 * Broker fee at a player-owned structure. Unlike an NPC station, the rate is
 * not derived from Broker Relations or standings: it is the fixed 0.5% SCC
 * surcharge plus whatever percentage the structure's owner set. So it cannot
 * be computed, only entered (or read back from a wallet journal entry).
 * Sales tax is unchanged (it comes from Accounting), and Advanced Broker
 * Relations still discounts the relist fee.
 */

import { MIN_BROKER_FEE_ISK, salesTax } from '@/engine/industry/fees';

export const STRUCTURE_SCC_SURCHARGE_PCT = 0.5;
export const MAX_STRUCTURE_OWNER_PCT = 100;

/** Total broker fee % charged at a structure whose owner set `ownerPct`. */
export function structureBrokerPct(ownerPct: number): number {
  if (!Number.isFinite(ownerPct) || ownerPct < 0) {
    throw new RangeError(`owner fee must be a non-negative number, got ${ownerPct}`);
  }
  return STRUCTURE_SCC_SURCHARGE_PCT + ownerPct;
}

/**
 * The owner's percentage implied by a broker fee actually paid on an order of
 * `price` x `volume`. Null when it cannot be derived sensibly (no order value,
 * or the fee is below the SCC surcharge alone).
 */
export function impliedOwnerPct(feePaid: number, price: number, volume: number): number | null {
  const value = price * volume;
  if (![feePaid, value].every(Number.isFinite) || value <= 0 || feePaid <= 0) return null;
  const owner = (feePaid / value) * 100 - STRUCTURE_SCC_SURCHARGE_PCT;
  return owner >= 0 ? owner : null;
}

export interface ListingNetInputs {
  gross: number;
  accountingLevel: number;
  /** Total broker fee % (see `structureBrokerPct`). */
  brokerPct: number;
}

/** What a listing of `gross` ISK nets after sales tax and the broker fee (100 ISK minimum). */
export function listingNet({ gross, accountingLevel, brokerPct }: ListingNetInputs): number {
  const fee = Math.max(MIN_BROKER_FEE_ISK, (gross * brokerPct) / 100);
  return gross - salesTax(gross, accountingLevel) - fee;
}
