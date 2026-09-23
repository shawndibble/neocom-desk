/**
 * The Mining Overview's saved daily Jita buy/sell prices (issue #1279) —
 * Dexie layer only; the pricing rules live in `engine/miningTax/priceBasis.ts`.
 */
import { db } from '@/db';
import {
  mergeSnapshotDay,
  prunePriceSnapshotDates,
  type SnapshotDay,
} from '@/engine/miningTax/priceBasis';

/** Folds `prices` into today's saved day and drops days older than 90. */
export async function saveTodayPriceSnapshot(today: string, prices: SnapshotDay): Promise<void> {
  await db.transaction('rw', db.jitaPriceSnapshots, async () => {
    const existing = await db.jitaPriceSnapshots.get(today);
    await db.jitaPriceSnapshots.put({
      date: today,
      prices: mergeSnapshotDay(existing?.prices ?? {}, prices),
    });
    const dates = (await db.jitaPriceSnapshots.toCollection().primaryKeys()) as string[];
    const stale = prunePriceSnapshotDates(dates, today);
    if (stale.length > 0) await db.jitaPriceSnapshots.bulkDelete(stale);
  });
}

/** Every saved day, by date. */
export async function loadPriceSnapshots(): Promise<Map<string, SnapshotDay>> {
  const records = await db.jitaPriceSnapshots.toArray();
  return new Map(records.map((record) => [record.date, record.prices]));
}
