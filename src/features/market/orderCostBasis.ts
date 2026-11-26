import { db, type ProductionOrderWatchRecord, type ProductionRunRecord } from '@/db';
import { hasWalletScope, loadWalletTransactions } from '@/features/character/wallet';
import {
  walletCostBasis,
  type WalletBuyUsed,
  type WalletTrade,
} from '@/engine/market/walletCostBasis';
import type { MarketOrder, WalletTransaction } from '@/esi/endpoints';

export interface ProductionRunBasis {
  source?: 'productionRun';
  unitCost: number;
  runId: string;
  runQuantity: number;
  materialCost: number;
  jobFee: number;
}

export interface WalletBasis {
  source: 'wallet';
  unitCost: number;
  unitsCovered: number;
  buyCount: number;
  oldestBuy: string;
  newestBuy: string;
  buys: WalletBuyUsed[];
  truncated: boolean;
}

export type OrderCostBasis = ProductionRunBasis | WalletBasis;

export type WalletBasisGap =
  | { kind: 'partial'; coveredUnits: number; pool: number; truncated: boolean }
  | { kind: 'historyShort'; truncated: boolean };

function watchId(characterId: number, orderId: number): string {
  return `${characterId}:order:${orderId}`;
}

export async function loadOrderCostBases(
  characterId: number,
  orderIds: readonly number[]
): Promise<Map<number, ProductionRunBasis>> {
  const result = new Map<number, ProductionRunBasis>();
  if (orderIds.length === 0) return result;

  const watches = await db.productionOrderWatches.bulkGet(
    orderIds.map((orderId) => watchId(characterId, orderId))
  );

  const runIds = Array.from(
    new Set(
      watches.filter((w): w is ProductionOrderWatchRecord => w !== undefined).map((w) => w.runId)
    )
  );
  if (runIds.length === 0) return result;

  const runs = await db.productionRuns.bulkGet(runIds);
  const runById = new Map(
    runs.filter((r): r is ProductionRunRecord => r !== undefined).map((r) => [r.id, r] as const)
  );

  orderIds.forEach((orderId, index) => {
    const watch = watches[index];
    if (!watch) return;
    const run = runById.get(watch.runId);
    if (!run || !(run.quantity > 0)) return;
    result.set(orderId, {
      unitCost: run.totalCost / run.quantity,
      runId: run.id,
      runQuantity: run.quantity,
      materialCost: run.materialCost,
      jobFee: run.jobFee,
    });
  });

  return result;
}

export function toWalletTrade(t: WalletTransaction): WalletTrade {
  return {
    transactionId: t.transaction_id,
    date: t.date,
    typeId: t.type_id,
    quantity: t.quantity,
    unitPrice: t.unit_price,
    isBuy: t.is_buy,
    isPersonal: t.is_personal,
  };
}

export interface WalletOrderCostBases {
  bases: Map<number, WalletBasis>;
  gaps: Map<number, WalletBasisGap>;
}

export async function loadWalletOrderCostBases(
  characterId: number,
  orders: readonly MarketOrder[],
  excludeOrderIds: ReadonlySet<number>
): Promise<WalletOrderCostBases> {
  const out: WalletOrderCostBases = { bases: new Map(), gaps: new Map() };
  const byType = new Map<number, MarketOrder[]>();
  for (const order of orders) {
    if (order.is_corporation || order.is_buy_order || excludeOrderIds.has(order.order_id)) continue;
    const list = byType.get(order.type_id) ?? [];
    list.push(order);
    byType.set(order.type_id, list);
  }
  if (byType.size === 0) return out;
  if (!(await hasWalletScope(characterId))) return out;

  let wallet: Awaited<ReturnType<typeof loadWalletTransactions>>;
  try {
    wallet = await loadWalletTransactions(characterId);
  } catch {
    return out;
  }
  if (!wallet) return out;

  const trades = wallet.data.map(toWalletTrade);
  const truncated = wallet.truncated ?? false;

  for (const [typeId, typeOrders] of byType) {
    const pool = typeOrders.reduce((sum, o) => sum + o.volume_remain, 0);
    const result = walletCostBasis({ transactions: trades, typeId, pool, truncated });
    if (!result) continue;
    for (const order of typeOrders) {
      if (result.status === 'covered') {
        out.bases.set(order.order_id, {
          source: 'wallet',
          unitCost: result.unitCost,
          unitsCovered: result.unitsCovered,
          buyCount: result.buyCount,
          oldestBuy: result.oldestBuy,
          newestBuy: result.newestBuy,
          buys: result.buys,
          truncated: result.truncated,
        });
      } else if (result.status === 'partial') {
        out.gaps.set(order.order_id, {
          kind: 'partial',
          coveredUnits: result.coveredUnits,
          pool: result.pool,
          truncated: result.truncated,
        });
      } else {
        out.gaps.set(order.order_id, { kind: 'historyShort', truncated: result.truncated });
      }
    }
  }
  return out;
}
