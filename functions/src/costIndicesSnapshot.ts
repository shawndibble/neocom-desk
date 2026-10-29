/**
 * System cost index history: one small R2 object per solar system, all activities,
 * since EVE Ref's own files (~2 MB, every system) are too big for the app to chart.
 * Mutable keys, no lifecycle rule. Free of relative runtime imports so the backfill
 * script loads it under Node type stripping.
 */
import { gzipSync } from 'node:zlib';
import type { R2Get, R2Put } from './r2Client.js';
import type { WriteOpenPricesResult } from './r2DailySnapshots.js';
import { isPlainRecord } from './guards.js';

export const COST_INDICES_R2_PREFIX = 'cost-indices/';
/** Days kept per system; the oldest drop first. */
export const COST_INDICES_MAX_DAYS = 120;
export const INDUSTRY_SYSTEMS_URL = 'https://esi.evetech.net/industry/systems';

const HEADERS = {
  'Content-Type': 'application/json',
  'Content-Encoding': 'gzip',
  'Cache-Control': 'public, max-age=3600',
};
/** Small objects dominated by round-trip latency, as in `r2DailySnapshots.ts`. */
const CONCURRENCY = 32;

/** activity -> cost index, for one system on one day. */
export type SystemCostIndices = Record<string, number>;
/** solar system id -> its activities' cost indices, for one day. */
export type DayCostIndices = Record<number, SystemCostIndices>;

export interface StoredSystemCostIndices {
  systemId: number;
  lastSyncedAt: number;
  /** ISO dates ascending, one per column. */
  dates: string[];
  /** activity -> one value per entry of `dates`, `null` for a day it was absent. */
  activities: Record<string, Array<number | null>>;
}

/** One object per system, so a popover reads a few KB, not every system. */
export function costIndicesR2Key(systemId: number): string {
  return `${COST_INDICES_R2_PREFIX}${systemId}.json`;
}

/** ESI's system list -> `{ systemId: { activity: index } }`. Malformed entries are skipped, never thrown on. */
export function parseCostIndices(body: unknown): DayCostIndices {
  const day: DayCostIndices = {};
  if (!Array.isArray(body)) return day;
  for (const raw of body as unknown[]) {
    if (!isPlainRecord(raw)) continue;
    const id = raw.solar_system_id;
    if (typeof id !== 'number' || !Number.isFinite(id) || !Array.isArray(raw.cost_indices))
      continue;
    const activities: SystemCostIndices = {};
    for (const entry of raw.cost_indices as unknown[]) {
      if (!isPlainRecord(entry)) continue;
      const { activity, cost_index: index } = entry;
      if (typeof activity === 'string' && typeof index === 'number' && Number.isFinite(index)) {
        activities[activity] = index;
      }
    }
    if (Object.keys(activities).length > 0) day[id] = activities;
  }
  return day;
}

function isStored(value: unknown): value is StoredSystemCostIndices {
  return isPlainRecord(value) && Array.isArray(value.dates) && isPlainRecord(value.activities);
}

/**
 * Folds `days` (date -> the system's indices that day) into the system's stored
 * object. Idempotent: a re-run replaces that date's column. Past the window the
 * oldest columns drop, and an activity left with no value at all goes with them.
 */
export function mergeSystemCostIndices(
  systemId: number,
  existing: unknown,
  days: ReadonlyArray<{ date: string; indices: SystemCostIndices }>,
  lastSyncedAt: number,
  maxDays = COST_INDICES_MAX_DAYS
): StoredSystemCostIndices {
  const byDate = new Map<string, SystemCostIndices>();
  if (isStored(existing)) {
    existing.dates.forEach((date, i) => {
      const row: SystemCostIndices = {};
      for (const [activity, column] of Object.entries(existing.activities)) {
        const value = Array.isArray(column) ? column[i] : null;
        if (typeof value === 'number') row[activity] = value;
      }
      byDate.set(date, row);
    });
  }
  for (const { date, indices } of days) byDate.set(date, indices);
  const dates = [...byDate.keys()].sort().slice(-maxDays);
  const names = new Set(dates.flatMap((date) => Object.keys(byDate.get(date) ?? {})));
  const activities: Record<string, Array<number | null>> = {};
  for (const name of [...names].sort()) {
    activities[name] = dates.map((date) => byDate.get(date)?.[name] ?? null);
  }
  return { systemId, lastSyncedAt, dates, activities };
}

/** `lastSyncedAt` changes every run, so no system is ever skipped. */
export type WriteCostIndicesResult = Omit<WriteOpenPricesResult, 'skipped'>;

/**
 * Merges `days` into every system's R2 object (read, merge, write). A system
 * in none of the days is left alone. A system that fails is counted, not thrown:
 * the merge is idempotent, so the caller retries the whole run.
 */
export async function writeCostIndicesToR2(
  days: ReadonlyArray<{ date: string; indices: DayCostIndices }>,
  io: { get: R2Get; put: R2Put },
  lastSyncedAt: number
): Promise<WriteCostIndicesResult> {
  const perSystem = new Map<number, Array<{ date: string; indices: SystemCostIndices }>>();
  for (const { date, indices } of days) {
    for (const [id, activities] of Object.entries(indices)) {
      const list = perSystem.get(Number(id)) ?? [];
      list.push({ date, indices: activities });
      perSystem.set(Number(id), list);
    }
  }
  const iterator = perSystem.entries();
  let written = 0;
  let failed = 0;
  let firstError: string | null = null;
  const worker = async () => {
    for (let step = iterator.next(); !step.done; step = iterator.next()) {
      const [systemId, entries] = step.value;
      const key = costIndicesR2Key(systemId);
      try {
        const merged = mergeSystemCostIndices(systemId, await io.get(key), entries, lastSyncedAt);
        await io.put(key, gzipSync(JSON.stringify(merged)), HEADERS);
        written += 1;
      } catch (error) {
        failed += 1;
        firstError ??= String(error);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return { written, failed, firstError };
}
