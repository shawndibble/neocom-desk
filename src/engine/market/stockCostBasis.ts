/**
 * Stock Cost Basis (issue #6381): what the units a Character holds of one
 * type cost them. The same FIFO as Wallet Cost Basis (`walletCostBasis`),
 * with the held quantity as the pool and each Production Run a further lot.
 * Null — never a guess, never 0 — whenever the history does not cover every
 * held unit.
 */
import { parseInstant } from '../esiInstant';
import { walletCostBasis, type ProductionLot, type WalletTrade } from './walletCostBasis';

export interface StockCostBasisInput {
  trades: readonly WalletTrade[];
  runs: readonly ProductionLot[];
  typeId: number;
  /** Units of the type the Character holds across all locations. */
  held: number;
  /** Stretches (epoch ms) the wallet archive never saw. A lot older than the end of one is not trusted. */
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
  // A fill missed in a gap could have been a sell or a buy that reorders the queue.
  const oldest = parseInstant(result.oldestBuy);
  if (oldest === null) return null;
  if (gaps.some(([, to]) => oldest < to)) return null;
  return { unitCost: result.unitCost, totalCost: result.unitCost * held };
}
