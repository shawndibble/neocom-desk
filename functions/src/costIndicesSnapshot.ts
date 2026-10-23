/**
 * The system cost index history (issue #4778): ESI's `/industry/systems` (public,
 * no token) folded into one small R2 object per solar system, so the Build Plan
 * can chart a facility's trend. EVE Ref's own history is ~2 MB a file (every
 * system), too big for the app to read, so this copies it into per-system objects.
 * All activities are kept.
 *
 * Mutable keys with a short `max-age`; an R2 lifecycle rule must not cover the
 * prefix, as in `r2DailySnapshots.ts`. Fetch- and Firestore-free, and free of
 * relative runtime imports like `r2Client.ts`, so the one-off backfill script can
 * load it under plain Node type stripping: the reads and uploads are arguments.
 */
import { gzipSync } from 'node:zlib';
import type { R2Get, R2Put } from './r2Client.js';

export const COST_INDICES_R2_PREFIX = 'cost-indices/';
/** Days kept per system; the oldest drop first. */
export const COST_INDICES_MAX_DAYS = 120;
export const INDUSTRY_SYSTEMS_URL = 'https://esi.evetech.net/industry/systems';

/** One object per system, so a hover reads a few KB, not the whole universe. */
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

export function costIndicesR2Key(systemId: number): string {
  return `${COST_INDICES_R2_PREFIX}${systemId}.json`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** ESI's system list -> `{ systemId: { activity: index } }`. Malformed entries are skipped, never thrown on. */
export function parseCostIndices(body: unknown): DayCostIndices {
  const day: DayCostIndices = {};
  if (!Array.isArray(body)) return day;
  for (const raw of body as unknown[]) {
    if (!isRecord(raw)) continue;
    const id = raw.solar_system_id;
    if (typeof id !== 'number' || !Number.isFinite(id) || !Array.isArray(raw.cost_indices))
      continue;
    const activities: SystemCostIndices = {};
    for (const entry of raw.cost_indices as unknown[]) {
      if (!isRecord(entry)) continue;
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
  return isRecord(value) && Array.isArray(value.dates) && isRecord(value.activities);
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

export interface WriteCostIndicesResult {
  written: number;
  failed: number;
  /** First failure's message, so an auth or network fault is diagnosable from the log. */
  firstError: string | null;
}

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
