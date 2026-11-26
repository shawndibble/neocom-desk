import { db } from '@/db';
import { isAnyCachePurgePending, isCachePurgePending, onCachePurged } from '@/esi/cachePurge';
import { DAY_MS } from './age';

const byCharacter = new Map<number, Map<string, unknown>>();

export const ACCOUNT_SNAPSHOT_ID = 0;

const MAX_AGE_MS = 7 * DAY_MS;

const IDLE_TIMEOUT_MS = 2000;

let persist = import.meta.env.MODE !== 'test';

let globalEpoch = 0;
const characterEpoch = new Map<number, number>();
const epochOf = (characterId: number) => `${globalEpoch}:${characterEpoch.get(characterId) ?? 0}`;

const hydrations = new Map<number, Promise<void>>();

interface PendingWrite {
  characterId: number;
  name: string;
  data: unknown;
  epoch: string;
}
const pendingWrites = new Map<string, PendingWrite>();
const lastStored = new Map<string, unknown>();
const warnedNotPlain = new Set<string>();
let flushScheduled = false;

const writeKey = (characterId: number, name: string) => `${characterId}\u0000${name}`;

const sessionWritten = new Set<string>();

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
      appVersion: __APP_RELEASE__,
    });
  } catch {
    lastStored.delete(key);
  }
}

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

export function routeSnapshotEpoch(characterId: number): string {
  return epochOf(characterId);
}

export function hasSessionRouteSnapshot(name: string, characterId: number): boolean {
  return sessionWritten.has(writeKey(characterId, name));
}

export function writeRouteSnapshot<T>(
  name: string,
  characterId: number,
  data: T,
  options: {
    startedAt?: string;
    persist?: boolean;
  } = {}
): void {
  if (options.startedAt !== undefined && options.startedAt !== epochOf(characterId)) return;
  remember(name, characterId, data);
  sessionWritten.add(writeKey(characterId, name));
  if (!persist || options.persist === false) return;
  pendingWrites.set(writeKey(characterId, name), {
    characterId,
    name,
    data,
    epoch: epochOf(characterId),
  });
  scheduleFlush();
}

export function hydrateRouteSnapshots(characterId: number): Promise<void> {
  if (!persist) return Promise.resolve();
  const running = hydrations.get(characterId);
  if (running !== undefined) return running;
  const epoch = epochOf(characterId);
  const hydration = (async () => {
    try {
      const suppressed =
        characterId === ACCOUNT_SNAPSHOT_ID
          ? await isAnyCachePurgePending()
          : await isCachePurgePending(characterId);
      if (suppressed) return;
      const rows = await db.routeSnapshots.where('characterId').equals(characterId).toArray();
      if (epoch !== epochOf(characterId)) return;
      const oldest = Date.now() - MAX_AGE_MS;
      const expired: [number, string][] = [];
      for (const row of rows) {
        if (row.appVersion !== __APP_RELEASE__ || row.savedAt < oldest) {
          expired.push([row.characterId, row.name]);
        } else if (readRouteSnapshot(row.name, characterId) === null) {
          remember(row.name, characterId, row.data);
          lastStored.set(writeKey(characterId, row.name), row.data);
        }
      }
      if (expired.length > 0) await db.routeSnapshots.bulkDelete(expired);
    } catch {}
  })();
  hydrations.set(characterId, hydration);
  return hydration;
}

function dropPending(characterId: number | null): void {
  for (const [key, entry] of pendingWrites) {
    if (characterId === null || entry.characterId === characterId) pendingWrites.delete(key);
  }
}

export function forgetRouteSnapshots(characterId: number): void {
  for (const id of [characterId, ACCOUNT_SNAPSHOT_ID]) {
    characterEpoch.set(id, (characterEpoch.get(id) ?? 0) + 1);
    byCharacter.delete(id);
    hydrations.delete(id);
    dropPending(id);
    for (const keys of [lastStored.keys(), sessionWritten.values()]) {
      for (const key of [...keys]) {
        if (key.startsWith(`${id}\u0000`)) {
          lastStored.delete(key);
          sessionWritten.delete(key);
        }
      }
    }
  }
  if (!persist) return;
  try {
    void db.routeSnapshots
      .where('characterId')
      .anyOf(characterId, ACCOUNT_SNAPSHOT_ID)
      .delete()
      .catch(() => undefined);
  } catch {}
}

export async function clearRouteSnapshots(): Promise<void> {
  globalEpoch += 1;
  byCharacter.clear();
  hydrations.clear();
  dropPending(null);
  lastStored.clear();
  sessionWritten.clear();
  if (persist) await db.routeSnapshots.clear().catch(() => undefined);
}

export function resetRouteSnapshots(): void {
  globalEpoch += 1;
  byCharacter.clear();
  hydrations.clear();
  pendingWrites.clear();
  lastStored.clear();
  sessionWritten.clear();
  flushScheduled = false;
}

export function setRouteSnapshotPersistence(on: boolean): void {
  persist = on;
}

onCachePurged((characterId) => {
  if (characterId === null) void clearRouteSnapshots();
  else forgetRouteSnapshots(characterId);
});
