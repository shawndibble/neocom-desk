/**
 * Reads the open-wars list that the active-wars GitHub Actions job publishes to
 * R2 (`active-wars/wars.json`, plain fetch, no Firebase session). ESI cannot list one
 * corporation's wars, so the app takes the whole open list and picks its own
 * out of it (`engine/wars.ts`).
 *
 * Never rejects: a failed read or a stale or missing list all come back as
 * "no wars", so the banner stays quiet rather than wrong.
 */
import { parseStoredWars, type StoredWar } from '@/engine/wars';

export const ACTIVE_WARS_R2_URL = 'https://data.neocomdesk.com/active-wars/wars.json';
const R2_READ_TIMEOUT_MS = 20_000;
/** The sweep runs twice a day: reading more often only costs reads. */
const ACTIVE_WARS_REREAD_MS = 55 * 60 * 1000;
/**
 * How often a mounted page asks. Shorter than the re-read window so a tick
 * never lands just inside it and waits another hour, and a failed read is
 * retried within minutes; most ticks are answered from the last read.
 */
export const ACTIVE_WARS_POLL_MS = 15 * 60 * 1000;
/**
 * A list this old means the sweep has stopped, and an ended war would still be
 * listed (an early end moves `finished`, which only a sweep sees): hide it.
 * Four missed runs.
 */
export const ACTIVE_WARS_STALE_AFTER_MS = 48 * 60 * 60 * 1000;

const NONE: readonly StoredWar[] = [];

let lastRead: { at: number; data: unknown } | null = null;
let reading: Promise<void> | null = null;

/** The R2 copy, or null when it is missing, not a list, or cannot be fetched. */
async function readR2(): Promise<unknown> {
  try {
    const res = await fetch(ACTIVE_WARS_R2_URL, {
      signal: AbortSignal.timeout(R2_READ_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body: unknown = await res.json();
    // A stale copy (the job stopped) counts as a miss: the last good read ages out instead.
    const stored = parseStoredWars(body);
    return stored !== null && Date.now() - stored.updatedAt <= ACTIVE_WARS_STALE_AFTER_MS
      ? body
      : null;
  } catch {
    return null;
  }
}

async function readList(): Promise<void> {
  const fromR2 = await readR2();
  // A miss keeps whatever was last read (it still ages out) and does not stamp `at`,
  // so the next poll retries.
  if (fromR2 !== null) lastRead = { at: Date.now(), data: fromR2 };
}

/** The open wars from a stored doc, or none when it is missing, malformed or stale. */
export function freshActiveWars(data: unknown, now: number): readonly StoredWar[] {
  const stored = parseStoredWars(data);
  if (stored === null || now - stored.updatedAt > ACTIVE_WARS_STALE_AFTER_MS) return NONE;
  return stored.wars;
}

export async function loadActiveWars(): Promise<readonly StoredWar[]> {
  if (lastRead === null || Date.now() - lastRead.at >= ACTIVE_WARS_REREAD_MS) {
    // One read at a time: the Overview and the Corp page asking together share it.
    reading ??= readList().finally(() => {
      reading = null;
    });
    await reading;
  }
  return freshActiveWars(lastRead?.data, Date.now());
}

/** Test seam: forget the last read. */
export function resetActiveWarsCache(): void {
  lastRead = null;
  reading = null;
}
