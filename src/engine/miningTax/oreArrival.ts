import { entryKey } from './types';
import { DAY_MS, HOUR_MS, MINUTE_MS } from '@/lib/age';

export const ARRIVAL_WINDOW_MS = HOUR_MS;

const MIN_LEDGER_LAG_MS = 10 * MINUTE_MS;

export const GROWTH_WAIT_MS = ARRIVAL_WINDOW_MS - MIN_LEDGER_LAG_MS;

export interface OreArrival {
  quantity: number;
  grewAt: number | null;
}

export interface EntryArrival {
  characterId: number;
  date: string;
  ores: Readonly<Record<string, OreArrival>>;
}

export interface OreArrivalLog {
  entries: Readonly<Record<string, EntryArrival>>;
  checkedAt: Readonly<Record<string, number>>;
}

export const EMPTY_ORE_ARRIVAL_LOG: OreArrivalLog = { entries: {}, checkedAt: {} };

export interface FetchedEntryTotal {
  date: string;
  solarSystemId: number;
  oreLines: readonly { typeId: number; quantity: number }[];
}

export interface SettledEntryRef {
  characterId: number;
  date: string;
  solarSystemId: number;
  typeIds?: readonly number[];
}

function eveDayStartMs(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

export function isInArrivalWindow(date: string, nowMs: number): boolean {
  return eveDayStartMs(date) + DAY_MS + ARRIVAL_WINDOW_MS > nowMs;
}

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
  | { kind: 'none' }
  | { kind: 'quiet' }
  | { kind: 'arriving'; arriving: number; of: number; waitMs: number };

export function arrivalNotice(
  settled: readonly SettledEntryRef[],
  log: OreArrivalLog,
  nowMs: number
): ArrivalNotice {
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
