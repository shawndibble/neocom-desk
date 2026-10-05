/**
 * "Is ore still arriving?" for Settle up (scope decision 20261004 "settle up
 * waits for ore still arriving"). ESI's mining ledger has no timestamps: a row
 * is only a running total for one (character, EVE day, system, ore type), and
 * new mining reaches it in batches up to about an hour late. So the only
 * evidence of ore still coming in is a total that *grew* between two fetches,
 * and the best time for it is the fetch that first saw it grow.
 *
 * Pure: the caller persists the log and supplies every timestamp.
 */
import { entryKey } from './types';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * How long after the last growth an entry may still grow — ESI's longest
 * ledger lag. Also how long after its EVE day ends an entry may still grow.
 */
export const ARRIVAL_WINDOW_MS = HOUR_MS;

/** One ledger entry's last known moon-ore total, and when the app first saw it grow. */
export interface EntryArrival {
  characterId: number;
  /** EVE/UTC date, e.g. "2026-10-04". */
  date: string;
  quantity: number;
  /** Epoch ms of the fetch that last saw this total grow; `null` when no growth has been seen. */
  grewAt: number | null;
}

export interface OreArrivalLog {
  /** By `entryKey`; only entries that could still grow are kept. */
  entries: Readonly<Record<string, EntryArrival>>;
  /** By character id: epoch ms of the newest ledger fetch recorded. */
  checkedAt: Readonly<Record<string, number>>;
}

export const EMPTY_ORE_ARRIVAL_LOG: OreArrivalLog = { entries: {}, checkedAt: {} };

/** One entry from a fetch: its total across ore types. */
export interface FetchedEntryTotal {
  date: string;
  solarSystemId: number;
  quantity: number;
}

/** An entry being settled, identified the way a Mining Ledger Entry is. */
export interface SettledEntryRef {
  characterId: number;
  date: string;
  solarSystemId: number;
}

function eveDayStartMs(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

/** Whether an entry from `date` can still grow at `nowMs`: its EVE day, or the hour after it ends. */
export function isInArrivalWindow(date: string, nowMs: number): boolean {
  return eveDayStartMs(date) + DAY_MS + ARRIVAL_WINDOW_MS > nowMs;
}

/**
 * Folds one character's ledger fetch into the log. A fetch no newer than the
 * last one recorded for that character is the same response served again and
 * changes nothing. An entry missing from the previous fetch counts as growth
 * only if that fetch was made during the entry's own EVE day — otherwise it
 * was simply never seen before (a first fetch, or a new day).
 */
export function recordLedgerFetch(
  log: OreArrivalLog,
  characterId: number,
  fetched: readonly FetchedEntryTotal[],
  fetchedAtMs: number
): OreArrivalLog {
  const previousCheck = log.checkedAt[String(characterId)];
  if (previousCheck !== undefined && fetchedAtMs <= previousCheck) return log;

  const entries: Record<string, EntryArrival> = {};
  for (const [key, entry] of Object.entries(log.entries)) {
    if (isInArrivalWindow(entry.date, fetchedAtMs)) entries[key] = entry;
  }

  for (const { date, solarSystemId, quantity } of fetched) {
    if (!isInArrivalWindow(date, fetchedAtMs)) continue;
    const key = entryKey(characterId, date, solarSystemId);
    const previous = log.entries[key];
    let grewAt: number | null;
    if (previous) grewAt = quantity > previous.quantity ? fetchedAtMs : previous.grewAt;
    else
      grewAt =
        previousCheck !== undefined && previousCheck >= eveDayStartMs(date) ? fetchedAtMs : null;
    entries[key] = { characterId, date, quantity, grewAt };
  }

  return {
    entries,
    checkedAt: { ...log.checkedAt, [String(characterId)]: fetchedAtMs },
  };
}

export type ArrivalNotice =
  /** No entry being settled can still grow. */
  | { kind: 'none' }
  /** Some can, but none has grown in the last hour (or the app can't tell yet). */
  | { kind: 'quiet' }
  /**
   * `arriving` of the `of` entries that can still grow did so within the hour;
   * wait `waitMs` for the last. Counted per Mining Ledger Entry, however many
   * Assignments it is settled as.
   */
  | { kind: 'arriving'; arriving: number; of: number; waitMs: number };

export function arrivalNotice(
  settled: readonly SettledEntryRef[],
  log: OreArrivalLog,
  nowMs: number
): ArrivalNotice {
  const inWindow = new Set(
    settled
      .filter((ref) => isInArrivalWindow(ref.date, nowMs))
      .map((ref) => entryKey(ref.characterId, ref.date, ref.solarSystemId))
  );
  if (inWindow.size === 0) return { kind: 'none' };

  let arriving = 0;
  let waitMs = 0;
  for (const key of inWindow) {
    const grewAt = log.entries[key]?.grewAt;
    if (grewAt == null || nowMs - grewAt >= ARRIVAL_WINDOW_MS) continue;
    arriving += 1;
    waitMs = Math.max(waitMs, grewAt + ARRIVAL_WINDOW_MS - nowMs);
  }
  if (arriving === 0) return { kind: 'quiet' };
  return { kind: 'arriving', arriving, of: inWindow.size, waitMs };
}

/** Whether any entry that can still grow belongs to a character whose ledger wasn't fetched since `sinceMs`. */
export function uncheckedSince(
  settled: readonly SettledEntryRef[],
  log: OreArrivalLog,
  sinceMs: number,
  nowMs: number
): boolean {
  return settled.some(
    (ref) =>
      isInArrivalWindow(ref.date, nowMs) &&
      (log.checkedAt[String(ref.characterId)] ?? -Infinity) < sinceMs
  );
}
