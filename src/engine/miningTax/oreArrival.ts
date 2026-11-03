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
import { DAY_MS, HOUR_MS, MINUTE_MS } from '@/lib/age';

/**
 * ESI's longest ledger lag: how long after its EVE day ends an entry may
 * still grow.
 */
export const ARRIVAL_WINDOW_MS = HOUR_MS;

/** ESI's shortest ledger lag: ore that showed up was mined at least this long before. */
const MIN_LEDGER_LAG_MS = 10 * MINUTE_MS;

/**
 * How long after the fetch that saw an entry grow more ore can still turn up:
 * the ore just seen was mined at least `MIN_LEDGER_LAG_MS` earlier, so the
 * rest of ESI's longest lag is all that's left.
 */
export const GROWTH_WAIT_MS = ARRIVAL_WINDOW_MS - MIN_LEDGER_LAG_MS;

/** One ore type's last known total within a ledger entry, and when the app last saw it grow. */
export interface OreArrival {
  quantity: number;
  /** Epoch ms of the fetch that last saw this total grow; `null` when no growth has been seen. */
  grewAt: number | null;
}

/**
 * One ledger entry's moon-ore totals per ore type (keyed by type id). Growth is
 * tracked per ore type so ore mined for one Payee doesn't hold up another
 * Payee's settlement once that one's ore has stopped coming in.
 */
export interface EntryArrival {
  characterId: number;
  /** EVE/UTC date, e.g. "2026-10-04". */
  date: string;
  ores: Readonly<Record<string, OreArrival>>;
}

export interface OreArrivalLog {
  /** By `entryKey`; only entries that could still grow are kept. */
  entries: Readonly<Record<string, EntryArrival>>;
  /** By character id: epoch ms of the newest ledger fetch recorded. */
  checkedAt: Readonly<Record<string, number>>;
}

export const EMPTY_ORE_ARRIVAL_LOG: OreArrivalLog = { entries: {}, checkedAt: {} };

/** One entry from a fetch: its total per ore type. */
export interface FetchedEntryTotal {
  date: string;
  solarSystemId: number;
  oreLines: readonly { typeId: number; quantity: number }[];
}

/** An entry being settled, identified the way a Mining Ledger Entry is. */
export interface SettledEntryRef {
  characterId: number;
  date: string;
  solarSystemId: number;
  /**
   * The ore types this settlement covers. Only growth in these counts; absent
   * means every ore type in the entry.
   */
  typeIds?: readonly number[];
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

  for (const { date, solarSystemId, oreLines } of fetched) {
    if (!isInArrivalWindow(date, fetchedAtMs)) continue;
    const key = entryKey(characterId, date, solarSystemId);
    const previous = log.entries[key];
    const seenDuringDay = previousCheck !== undefined && previousCheck >= eveDayStartMs(date);
    const ores: Record<string, OreArrival> = {};
    for (const { typeId, quantity } of oreLines) {
      const before = previous?.ores[String(typeId)];
      let grewAt: number | null;
      if (before) grewAt = quantity > before.quantity ? fetchedAtMs : before.grewAt;
      // A new ore type in an entry already seen is new ore; in an entry never
      // seen it follows the entry's own rule.
      else grewAt = previous || seenDuringDay ? fetchedAtMs : null;
      ores[String(typeId)] = { quantity, grewAt };
    }
    entries[key] = { characterId, date, ores };
  }

  return {
    entries,
    checkedAt: { ...log.checkedAt, [String(characterId)]: fetchedAtMs },
  };
}

export type ArrivalNotice =
  /** No entry being settled can still grow. */
  | { kind: 'none' }
  /** Some can, but none has grown within `GROWTH_WAIT_MS` (or the app can't tell yet). */
  | { kind: 'quiet' }
  /**
   * `arriving` of the `of` entries that can still grow did so within `GROWTH_WAIT_MS`;
   * wait `waitMs` for the last. Counted per Mining Ledger Entry, however many
   * Assignments it is settled as.
   */
  | { kind: 'arriving'; arriving: number; of: number; waitMs: number };

export function arrivalNotice(
  settled: readonly SettledEntryRef[],
  log: OreArrivalLog,
  nowMs: number
): ArrivalNotice {
  // Per entry, the ore types settled (`null`: all of them).
  const inWindow = new Map<string, Set<number> | null>();
  for (const ref of settled) {
    if (!isInArrivalWindow(ref.date, nowMs)) continue;
    const key = entryKey(ref.characterId, ref.date, ref.solarSystemId);
    const known = inWindow.get(key);
    if (known === null || !ref.typeIds) inWindow.set(key, null);
    else inWindow.set(key, new Set([...(known ?? []), ...ref.typeIds]));
  }
  if (inWindow.size === 0) return { kind: 'none' };

  let arriving = 0;
  let waitMs = 0;
  for (const [key, typeIds] of inWindow) {
    const ores = log.entries[key]?.ores ?? {};
    let latest: number | null = null;
    for (const [typeId, ore] of Object.entries(ores)) {
      if (typeIds && !typeIds.has(Number(typeId))) continue;
      if (ore.grewAt != null && (latest === null || ore.grewAt > latest)) latest = ore.grewAt;
    }
    if (latest === null || nowMs - latest >= GROWTH_WAIT_MS) continue;
    arriving += 1;
    waitMs = Math.max(waitMs, latest + GROWTH_WAIT_MS - nowMs);
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
