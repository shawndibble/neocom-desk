import Dexie from 'dexie';
import { db } from '@/db';
import {
  CORP_CACHE_KEY_PREFIX,
  GLOBAL_CACHE_CHARACTER_ID,
  STRUCTURE_CACHE_KEY_PREFIX,
} from './cache';

type PurgedListener = (characterId: number | null) => void;
const purgedListeners = new Set<PurgedListener>();

export function onCachePurged(listener: PurgedListener): () => void {
  purgedListeners.add(listener);
  return () => purgedListeners.delete(listener);
}

function emitCachePurged(characterId: number | null): void {
  for (const listener of purgedListeners) listener(characterId);
}

export async function purgeCharacterCache(characterId: number): Promise<number> {
  if (characterId === GLOBAL_CACHE_CHARACTER_ID) return 0;
  const deleted = await db.esiCache
    .where('[characterId+key]')
    .between([characterId, Dexie.minKey], [characterId, Dexie.maxKey], true, true)
    .delete();
  emitCachePurged(characterId);
  return deleted;
}

export async function purgeCorpScopedCache(characterId: number): Promise<number> {
  if (characterId === GLOBAL_CACHE_CHARACTER_ID) return 0;
  const upperBound = CORP_CACHE_KEY_PREFIX + String.fromCharCode(0xffff);
  const deleted = await db.esiCache
    .where('[characterId+key]')
    .between([characterId, CORP_CACHE_KEY_PREFIX], [characterId, upperBound], true, true)
    .delete();
  emitCachePurged(characterId);
  return deleted;
}

export async function purgeSharedStructureCache(): Promise<number> {
  const upperBound = STRUCTURE_CACHE_KEY_PREFIX + String.fromCharCode(0xffff);
  const deleted = await db.esiCache
    .where('[characterId+key]')
    .between(
      [GLOBAL_CACHE_CHARACTER_ID, STRUCTURE_CACHE_KEY_PREFIX],
      [GLOBAL_CACHE_CHARACTER_ID, upperBound],
      true,
      true
    )
    .delete();
  emitCachePurged(GLOBAL_CACHE_CHARACTER_ID);
  return deleted;
}

export const CACHE_PURGE_PENDING_PREFIX = 'esiCache.purgePending.';

const pendingKey = (characterId: number) => `${CACHE_PURGE_PENDING_PREFIX}${characterId}`;

const pending = new Set<number>();

let hydration: Promise<void> | null = null;

function hydratePending(): Promise<void> {
  hydration ??= db.settings
    .where('key')
    .startsWith(CACHE_PURGE_PENDING_PREFIX)
    .toArray()
    .then((rows) => {
      for (const row of rows) {
        const characterId = Number(row.key.slice(CACHE_PURGE_PENDING_PREFIX.length));
        if (Number.isInteger(characterId) && characterId !== GLOBAL_CACHE_CHARACTER_ID) {
          pending.add(characterId);
        }
      }
    })
    .catch(() => {
      hydration = null;
    });
  return hydration;
}

export async function isAnyCachePurgePending(): Promise<boolean> {
  if (pending.size > 0) return true;
  try {
    await hydratePending();
  } catch {}
  return pending.size > 0;
}

export async function isCachePurgePending(characterId: number): Promise<boolean> {
  if (characterId === GLOBAL_CACHE_CHARACTER_ID) return false;
  if (pending.has(characterId)) return true;
  try {
    await hydratePending();
  } catch {}
  return pending.has(characterId);
}

export async function clearCachePurgePending(characterId: number): Promise<void> {
  pending.delete(characterId);
  try {
    await db.settings.delete(pendingKey(characterId));
  } catch {}
}

async function markCachePurgePending(characterId: number): Promise<void> {
  pending.add(characterId);
  try {
    await db.settings.put({ key: pendingKey(characterId), value: true });
  } catch {}
}

export type CachePurgeOutcome = 'targeted' | 'full' | 'suppressed';

export async function purgeCharacterCacheOrSuppress(
  characterId: number
): Promise<CachePurgeOutcome> {
  if (characterId === GLOBAL_CACHE_CHARACTER_ID) return 'targeted';

  let outcome: CachePurgeOutcome = 'targeted';
  try {
    await purgeCharacterCache(characterId);
  } catch {
    emitCachePurged(characterId);
    try {
      await db.esiCache.clear();
      emitCachePurged(null);
      outcome = 'full';
    } catch {
      await markCachePurgePending(characterId);
      return 'suppressed';
    }
  }
  await clearCachePurgePending(characterId);
  return outcome;
}
