/**
 * What the goods behind a sell order cost, for the Market Orders page's
 * profit-so-far column — read-only over the existing Production Run /
 * Production Order Watch records (`src/db/index.ts`, issue #525). No new
 * Dexie table, no hand-entered-cost store: an order with nothing watched
 * against it simply has no cost basis today (a later ticket's problem).
 *
 * `db.productionOrderWatches` is how an order id ever finds its way back to
 * a Production Run: its id is always `${characterId}:order:${orderId}`, and
 * it names the `runId` whose `materialCost`/`jobFee`/`totalCost` were frozen
 * at logging time (`ProductionRunRecord`'s doc comment — a run holds still so
 * realized profit can be measured against what was actually paid).
 */
import { db, type ProductionOrderWatchRecord, type ProductionRunRecord } from '@/db';
import { hasWalletScope, loadWalletTransactions } from '@/features/character/wallet';
import { walletCostBasis, type WalletTrade } from '@/engine/market/walletCostBasis';
import type { MarketOrder } from '@/esi/endpoints';

/** Cost taken from a Production Run linked to the order (the original source). */
export interface ProductionRunBasis {
  /** Absent on the original shape; only ever `'productionRun'` when set. */
  source?: 'productionRun';
  unitCost: number;
  runId: string;
  /** Units the run produced, for the detail view's working. */
  runQuantity: number;
  materialCost: number;
  jobFee: number;
}

/** Cost worked out FIFO from the character's own wallet buys (issue #1422). */
export interface WalletBasis {
  source: 'wallet';
  unitCost: number;
  unitsCovered: number;
  buyCount: number;
  oldestBuy: string;
  newestBuy: string;
  /** The wallet fetch hit its page cap, so older history may exist. */
  truncated: boolean;
}

export type OrderCostBasis = ProductionRunBasis | WalletBasis;

/** Why an eligible order got no wallet basis. */
export type WalletBasisGap =
  | { kind: 'partial'; coveredUnits: number; pool: number; truncated: boolean }
  | { kind: 'historyShort'; truncated: boolean };

function watchId(characterId: number, orderId: number): string {
  return `${characterId}:order:${orderId}`;
}

/**
 * Cost basis for the given order ids, from the Production Run each one is
 * watched against. Orders with no linked watch, a watch pointing at a
 * missing run, or a run with a non-positive `quantity` (which would divide
 * to `Infinity`/`NaN`) are simply absent from the map — never a zero or
 * infinite entry.
 */
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

export interface WalletOrderCostBases {
  bases: Map<number, WalletBasis>;
  gaps: Map<number, WalletBasisGap>;
}

/**
 * Wallet cost basis for a character's unlinked personal sell orders. Orders
 * in `excludeOrderIds` (already costed from a Production Run) are skipped and
 * left out of the unit pool. A character without the wallet scope, or whose
 * wallet cannot be read, simply gets nothing — never an error.
 */
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

  const trades: WalletTrade[] = wallet.data.map((t) => ({
    transactionId: t.transaction_id,
    date: t.date,
    typeId: t.type_id,
    quantity: t.quantity,
    unitPrice: t.unit_price,
    isBuy: t.is_buy,
    isPersonal: t.is_personal,
  }));
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
