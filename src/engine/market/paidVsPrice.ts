/**
 * What a character paid for the units of one type it still holds, worked out
 * from its wallet buys by `walletCostBasis` (issue #5333). Reuses that FIFO
 * rather than adding a second one: asking for more units than exist reports
 * how many remain, and asking for exactly that many yields their average.
 * A shortfall in history (`historyShort`) or nothing held gives null — never
 * an estimate.
 *
 * Pure.
 */
import { walletCostBasis, type WalletCostBasisInput } from './walletCostBasis';

export interface PaidBasis {
  /** Average ISK paid per unit still held, before fees. */
  unitCost: number;
  /** Units the average covers. */
  units: number;
}

export function paidBasis(input: Omit<WalletCostBasisInput, 'pool'>): PaidBasis | null {
  const probe = walletCostBasis({ ...input, pool: Number.MAX_SAFE_INTEGER });
  if (probe?.status !== 'partial' || !(probe.coveredUnits > 0)) return null;
  const result = walletCostBasis({ ...input, pool: probe.coveredUnits });
  if (result?.status !== 'covered') return null;
  return { unitCost: result.unitCost, units: result.unitsCovered };
}

/** Current price against the average paid, in whole percent, signed; null when either is unusable. */
export function percentVsPaid(price: number | null, paid: number): number | null {
  if (price === null || !(price > 0) || !(paid > 0)) return null;
  return Math.round(((price - paid) / paid) * 100);
}
