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

export interface OrderCostBasis {
  unitCost: number;
  runId: string;
  /** Units the run produced, for the detail view's working. */
  runQuantity: number;
  materialCost: number;
  jobFee: number;
}

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
): Promise<Map<number, OrderCostBasis>> {
  const result = new Map<number, OrderCostBasis>();
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
