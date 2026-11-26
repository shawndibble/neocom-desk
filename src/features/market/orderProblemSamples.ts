import { db, type OrderProblemSampleRecord } from '@/db';
import {
  appendOrderProblemSample,
  type OrderProblemSample,
} from '@/engine/market/orderProblemHistory';
import type { OrderProblem } from '@/engine/market/orderProblems';
import type { CharacterOpenOrders } from './openOrdersData';

export interface OrderProblemReading {
  orderId: number;
  characterId: number;
  problem: OrderProblem;
  unchecked?: boolean;
}

export function sampleableCharacterIds(entries: readonly CharacterOpenOrders[]): number[] {
  return entries
    .filter((entry) => !entry.needsReauth && entry.fetchedAt > 0)
    .map((entry) => entry.characterId);
}

export async function loadOrderProblemSamples(
  characterIds: readonly number[]
): Promise<Map<number, readonly OrderProblemSample[]>> {
  const byOrderId = new Map<number, readonly OrderProblemSample[]>();
  if (characterIds.length === 0) return byOrderId;
  const rows = await db.orderProblemSamples
    .where('characterId')
    .anyOf([...characterIds])
    .toArray();
  for (const row of rows) byOrderId.set(row.orderId, row.samples);
  return byOrderId;
}

export async function recordOrderProblemSamples(
  readings: readonly OrderProblemReading[],
  characterIds: readonly number[],
  nowMs: number
): Promise<void> {
  if (characterIds.length === 0) return;
  const openIds = new Set(readings.map((reading) => reading.orderId));

  await db.transaction('rw', db.orderProblemSamples, async () => {
    const existing = await db.orderProblemSamples
      .where('characterId')
      .anyOf([...characterIds])
      .toArray();
    const byOrderId = new Map(existing.map((row) => [row.orderId, row]));

    const staleIds = existing.filter((row) => !openIds.has(row.orderId)).map((row) => row.orderId);
    if (staleIds.length > 0) await db.orderProblemSamples.bulkDelete(staleIds);

    const updates: OrderProblemSampleRecord[] = [];
    for (const reading of readings) {
      if (reading.unchecked) continue;
      const row = byOrderId.get(reading.orderId);
      const samples = appendOrderProblemSample(row?.samples ?? [], {
        at: nowMs,
        problem: reading.problem,
      });
      if (row && samples === row.samples) continue;
      updates.push({
        orderId: reading.orderId,
        characterId: reading.characterId,
        samples: [...samples],
      });
    }
    if (updates.length > 0) await db.orderProblemSamples.bulkPut(updates);
  });
}
