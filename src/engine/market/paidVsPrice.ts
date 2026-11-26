import { walletCostBasis, type WalletCostBasisInput } from './walletCostBasis';

export interface PaidBasis {
  unitCost: number;
  units: number;
}

export function paidBasis(input: Omit<WalletCostBasisInput, 'pool'>): PaidBasis | null {
  const probe = walletCostBasis({ ...input, pool: Number.MAX_SAFE_INTEGER });
  if (probe?.status !== 'partial' || !(probe.coveredUnits > 0)) return null;
  const result = walletCostBasis({ ...input, pool: probe.coveredUnits });
  if (result?.status !== 'covered') return null;
  return { unitCost: result.unitCost, units: result.unitsCovered };
}

export function percentVsPaid(price: number | null, paid: number): number | null {
  if (price === null || !(price > 0) || !(paid > 0)) return null;
  return Math.round(((price - paid) / paid) * 100);
}
