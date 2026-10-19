/**
 * Publishes the hub-station mining prices to R2 (layout and fold:
 * miningHubPrices.ts). Kept apart from r2DailySnapshots.ts because that file
 * is loaded by the open-prices backfill script under Node type stripping,
 * which cannot follow this file's relative value import.
 */
import { gzipSync } from 'node:zlib';
import type { R2Delete, R2Get, R2Put } from './r2Client.js';
import {
  MINING_PRICES_MIGRATED_KEY,
  expiredMiningMonthKeys,
  groupByMonthObject,
  keepMiningDaysFrom,
  marketHistoryWrites,
  mergeMiningMonth,
  type MiningDayWrite,
  type MiningHub,
} from './miningHubPrices.js';

/** Rewritten once a day, like the open prices. */
const MINING_PRICES_HEADERS = {
  'Content-Type': 'application/json',
  'Content-Encoding': 'gzip',
  'Cache-Control': 'public, max-age=3600',
};

export interface MiningPublishIo {
  get: R2Get;
  put: R2Put;
  del: R2Delete;
  /** The retired Firestore `marketHistory` docs, `{ date: docId, data }`; read only until the copy is marked done. */
  loadLegacyDays: () => Promise<{ date: string; data: unknown }[]>;
}

export interface MiningPublishResult {
  /** Month objects written. */
  objects: number;
  /** Days copied from `marketHistory` on this run, or null when the copy was already done. */
  migratedDays: number | null;
  /** Expired month objects whose delete failed; retried by the next run. */
  deleteFailed: number;
}

/**
 * Publishes one day of hub-station mining prices (`writes`, from the station
 * fold) into the per-hub, per-month R2 objects (miningHubPrices.ts), merging
 * into what is stored. On the first run, while `MINING_PRICES_MIGRATED_KEY`
 * is missing, the old `marketHistory` days are copied in the same writes
 * (the fold's day wins a date both hold) and the marker is written only after
 * every object landed, so a failed run copies again on its retry. A failed
 * read or write throws (the whole run retries; the merge is idempotent). Month
 * objects past the 400-day window are deleted last; a failed delete is only
 * counted.
 */
export async function publishMiningPricesToR2(
  date: string,
  writes: readonly MiningDayWrite[],
  hubs: readonly MiningHub[],
  io: MiningPublishIo
): Promise<MiningPublishResult> {
  const migrated = (await io.get(MINING_PRICES_MIGRATED_KEY)) !== null;
  const legacy = migrated ? [] : marketHistoryWrites(await io.loadLegacyDays(), hubs);
  const keepFrom = keepMiningDaysFrom(date);
  const groups = groupByMonthObject([...legacy, ...writes]);
  await Promise.all(
    groups.map(async (group) => {
      const merged = mergeMiningMonth(group, await io.get(group.key), group.days, keepFrom);
      await io.put(group.key, gzipSync(JSON.stringify(merged)), MINING_PRICES_HEADERS);
    })
  );
  let migratedDays: number | null = null;
  if (!migrated) {
    migratedDays = new Set(legacy.map((w) => w.date)).size;
    await io.put(MINING_PRICES_MIGRATED_KEY, JSON.stringify({ date, days: migratedDays }), {
      'Content-Type': 'application/json',
    });
  }
  let deleteFailed = 0;
  await Promise.all(
    expiredMiningMonthKeys(date, hubs).map((key) =>
      io.del(key).catch(() => {
        deleteFailed += 1;
      })
    )
  );
  return { objects: groups.length, migratedDays, deleteFailed };
}
