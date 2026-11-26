import { parseInstant } from '../esiInstant';
import { walletCostBasis, type ProductionLot, type WalletTrade } from './walletCostBasis';

export interface StockCostBasisInput {
  trades: readonly WalletTrade[];
  runs: readonly ProductionLot[];
  typeId: number;
  held: number;
  gaps?: ReadonlyArray<readonly [number, number]>;
  truncated?: boolean;
}

export interface StockCostBasis {
  unitCost: number;
  totalCost: number;
}

export function stockCostBasis(input: StockCostBasisInput): StockCostBasis | null {
  const { trades, runs, typeId, held, gaps = [], truncated } = input;
  const result = walletCostBasis({
    transactions: trades,
    productionLots: runs,
    typeId,
    pool: held,
    truncated,
  });
  if (result?.status !== 'covered') return null;
  const oldest = parseInstant(result.oldestBuy);
  if (oldest === null) return null;
  if (gaps.some(([, to]) => oldest < to)) return null;
  return { unitCost: result.unitCost, totalCost: result.unitCost * held };
}
