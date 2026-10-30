/**
 * The last snapshot each view loaded, keyed by Character and then by view:
 * held in memory for synchronous reads during render, and mirrored to Dexie
 * (`routeSnapshots`) so the first visit after a reload opens on it too
 * (decision 20261030-170439).
 *
 * `useRouteSnapshot` keeps its snapshot in `useState`, so it dies with the
 * component — and React Router unmounts a route on navigation. That made every
 * tab visit start from `null` with `loading` true, i.e. a spinner, even though
 * `esi/cache.ts` had the rows in Dexie the whole time. The app's promise is the
 * opposite (CLAUDE.md, `STALE_AFTER.default`): page-to-page navigation shows
 * what it already has and updates in place.
 *
 * The stored copy is only ever a first frame: the view's loader still runs and
 * replaces it. A row another build wrote, or older than `MAX_AGE_MS`, is
 * dropped on read.
 */
import { db } from '@/db';
import { onCachePurged } from '@/esi/cachePurge';
import { DAY_MS } from './age';

/**
 * Character id → view name → that view's last snapshot.
 *
 * Nested rather than one flat `name:characterId` key so a purge is an outer
 * `delete`, with no string parsing to get subtly wrong for one id that happens
 * to end with another.
 */
const byCharacter = new Map<number, Map<string, unknown>>();

/**
 * The owner id for a value pooled across every Character on the account (all
 * their assets, their skills). Never a real Character id, and forgotten along
 * with any one Character's snapshots, since it carries that Character's data.
 */
export const ACCOUNT_SNAPSHOT_ID = 0;

/** Older than this, a stored snapshot is no longer worth showing as a first frame. */
const MAX_AGE_MS = 7 * DAY_MS;

/** How long a queued write may wait for an idle moment. */
const IDLE_TIMEOUT_MS = 2000;

/** Off under Vitest, so one test's snapshot can never return in another through a hydrate. */
let persist = import.meta.env.MODE !== 'test';

/**
 * Bumped by every purge (per Character, or `globalEpoch` for all): a hydrate
 * or a queued write that began under an older epoch is dropped, so a late
 * write can never bring a purged owner's rows back.
 */
let globalEpoch = 0;
const characterEpoch = new Map<number, number>();
const epochOf = (characterId: number) => `${globalEpoch}:${characterEpoch.get(characterId) ?? 0}`;

/** One Dexie read per Character per session; later misses wait on the same one. */
const hydrations = new Map<number, Promise<void>>();

interface PendingWrite {
  characterId: number;
  name: string;
  data: unknown;
  epoch: string;
}
const pendingWrites = new Map<string, PendingWrite>();
/** The reference last stored per view: an unchanged snapshot is not cloned again. */
const lastStored = new Map<string, unknown>();
const warnedNotPlain = new Set<string>();
let flushScheduled = false;

const writeKey = (characterId: number, name: string) => `${characterId}\u0000${name}`;

/**
 * Whether structured clone gives `value` back intact. A class instance keeps
 * its fields but loses its methods, which fails only when a page calls one.
 */
function isPlain(value: unknown, seen = new Set<unknown>()): boolean {
  if (value === null || typeof value !== 'object') {
    return typeof value !== 'function' && typeof value !== 'symbol';
  }
  if (seen.has(value)) return true;
  seen.add(value);
  if (value instanceof Date) return true;
  if (Array.isArray(value)) return value.every((item) => isPlain(item, seen));
  if (value instanceof Map) {
    for (const [k, v] of value) if (!isPlain(k, seen) || !isPlain(v, seen)) return false;
    return true;
  }
  if (value instanceof Set) {
    for (const item of value) if (!isPlain(item, seen)) return false;
    return true;
  }
  const proto: unknown = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return false;
  return Object.values(value).every((item) => isPlain(item, seen));
}

async function writeOne(entry: PendingWrite): Promise<void> {
  const key = writeKey(entry.characterId, entry.name);
  if (entry.epoch !== epochOf(entry.characterId) || lastStored.get(key) === entry.data) return;
  if (!isPlain(entry.data)) {
    if (import.meta.env.DEV && !warnedNotPlain.has(entry.name)) {
      warnedNotPlain.add(entry.name);
      console.warn(`[routeSnapshot] ${entry.name} holds non-plain data; kept in memory only`);
    }
    return;
  }
  lastStored.set(key, entry.data);
  try {
    await db.routeSnapshots.put({
      characterId: entry.characterId,
      name: entry.name,
      data: entry.data,
      savedAt: Date.now(),
      appVersion: __APP_VERSION__,
    });
  } catch {
    // A full disk, a clone the check missed, a closing database: the memory
    // copy still serves this session; only the stored one goes un-updated.
    lastStored.delete(key);
  }
}

/** Write every queued snapshot now. Also the idle callback's body. */
export async function flushRouteSnapshotWrites(): Promise<void> {
  flushScheduled = false;
  const entries = [...pendingWrites.values()];
  pendingWrites.clear();
  for (const entry of entries) await writeOne(entry);
}

function scheduleFlush(): void {
  if (flushScheduled) return;
  flushScheduled = true;
  const run = () => void flushRouteSnapshotWrites();
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(run, { timeout: IDLE_TIMEOUT_MS });
  } else {
    setTimeout(run, 0);
  }
}

export function readRouteSnapshot<T>(name: string, characterId: number): T | null {
  const found = byCharacter.get(characterId)?.get(name);
  return found === undefined ? null : (found as T);
}

function remember(name: string, characterId: number, data: unknown): void {
  let views = byCharacter.get(characterId);
  if (views === undefined) {
    views = new Map<string, unknown>();
    byCharacter.set(characterId, views);
  }
  views.set(name, data);
}

export function writeRouteSnapshot<T>(name: string, characterId: number, data: T): void {
  remember(name, characterId, data);
  if (!persist) return;
  pendingWrites.set(writeKey(characterId, name), {
    characterId,
    name,
    data,
    epoch: epochOf(characterId),
  });
  scheduleFlush();
}

/**
 * Load one Character's stored snapshots into memory, once per session. Never
 * overwrites a snapshot this session already holds: that one is newer.
 */
export function hydrateRouteSnapshots(characterId: number): Promise<void> {
  if (!persist) return Promise.resolve();
  const running = hydrations.get(characterId);
  if (running !== undefined) return running;
  const epoch = epochOf(characterId);
  const hydration = (async () => {
    try {
      const rows = await db.routeSnapshots.where('characterId').equals(characterId).toArray();
      if (epoch !== epochOf(characterId)) return;
      const oldest = Date.now() - MAX_AGE_MS;
      const expired: [number, string][] = [];
      for (const row of rows) {
        if (row.appVersion !== __APP_VERSION__ || row.savedAt < oldest) {
          expired.push([row.characterId, row.name]);
        } else if (readRouteSnapshot(row.name, characterId) === null) {
          remember(row.name, characterId, row.data);
          lastStored.set(writeKey(characterId, row.name), row.data);
        }
      }
      if (expired.length > 0) await db.routeSnapshots.bulkDelete(expired);
    } catch {
      // No stored copy is the old behaviour: the view loads as it always did.
    }
  })();
  hydrations.set(characterId, hydration);
  return hydration;
}

function dropPending(characterId: number | null): void {
  for (const [key, entry] of pendingWrites) {
    if (characterId === null || entry.characterId === characterId) pendingWrites.delete(key);
  }
}

/**
 * Drop every view's retained snapshot for one Character, in memory and in Dexie.
 *
 * Blunt on purpose, exactly as `purgeCharacterCache` is: over-forgetting costs
 * one Dexie re-read, under-forgetting is a privacy bug. That matters most for
 * `purgeCorpScopedCache`, which deletes only the `corp:` rows — forgetting
 * just as bluntly there is what keeps a previous corporation's board, roster
 * and assets off the screen after a corp change.
 */
export function forgetRouteSnapshots(characterId: number): void {
  // Account-wide values pool every Character, the purged one included.
  for (const id of [characterId, ACCOUNT_SNAPSHOT_ID]) {
    characterEpoch.set(id, (characterEpoch.get(id) ?? 0) + 1);
    byCharacter.delete(id);
    hydrations.delete(id);
    dropPending(id);
    for (const key of lastStored.keys()) if (key.startsWith(`${id}\u0000`)) lastStored.delete(key);
  }
  if (persist) {
    void db.routeSnapshots
      .where('characterId')
      .anyOf(characterId, ACCOUNT_SNAPSHOT_ID)
      .delete()
      .catch(() => undefined);
  }
}

/** Every Character's, for the cache-wide `db.esiCache.clear()` fallback tier. */
function forgetAllRouteSnapshots(): void {
  globalEpoch += 1;
  byCharacter.clear();
  hydrations.clear();
  dropPending(null);
  lastStored.clear();
  if (persist) void db.routeSnapshots.clear().catch(() => undefined);
}

/**
 * Test seam, and a reload's effect on this module: memory goes, Dexie stays.
 * Module state otherwise outlives a `beforeEach` that only clears Dexie.
 */
export function resetRouteSnapshots(): void {
  globalEpoch += 1;
  byCharacter.clear();
  hydrations.clear();
  pendingWrites.clear();
  lastStored.clear();
  flushScheduled = false;
}

/** Test seam: persistence is off under Vitest unless a test turns it on. */
export function setRouteSnapshotPersistence(on: boolean): void {
  persist = on;
}

onCachePurged((characterId) => {
  if (characterId === null) forgetAllRouteSnapshots();
  else forgetRouteSnapshots(characterId);
});
