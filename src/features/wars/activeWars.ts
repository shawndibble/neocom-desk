/**
 * Reads the open-wars list (`systemConditions/activeWars`) that the
 * `syncActiveWars` function keeps in Firestore. ESI cannot list one
 * corporation's wars, so the app takes the whole open list and picks its own
 * out of it (`engine/wars.ts`). Public data, so any signed-in session reads
 * it (`ensureAnySession`).
 *
 * Never rejects: a failed read, no sync configured, or a stale or missing list
 * all come back as "no wars", so the banner stays quiet rather than wrong.
 */
import { doc, getDoc } from 'firebase/firestore/lite';
import { isSyncConfigured } from '@/app/syncStatus';
import { parseStoredWars, type StoredWar } from '@/engine/wars';
import { getSyncFirestore } from '@/sync/firebaseApp';
import { ensureAnySession } from '@/sync/syncAuth';

const COLLECTION = 'systemConditions';
const DOC_ID = 'activeWars';
/** The sweep runs twice a day: reading more often only costs reads. */
export const ACTIVE_WARS_POLL_MS = 60 * 60 * 1000;
/**
 * A list this old means the sweep has stopped, and an ended war would still be
 * listed (an early end moves `finished`, which only a sweep sees): hide it.
 * Four missed runs.
 */
export const ACTIVE_WARS_STALE_AFTER_MS = 48 * 60 * 60 * 1000;

const NONE: readonly StoredWar[] = [];

let lastRead: { at: number; data: unknown } | null = null;
let reading: Promise<void> | null = null;

async function readList(characterId: number): Promise<void> {
  try {
    await ensureAnySession(characterId);
    const snapshot = await getDoc(doc(getSyncFirestore(), COLLECTION, DOC_ID));
    lastRead = { at: Date.now(), data: snapshot.data() };
  } catch {
    // Offline or signed out: keep whatever was last read; it still ages out.
  }
}

/** The open wars from a stored doc, or none when it is missing, malformed or stale. */
export function freshActiveWars(data: unknown, now: number): readonly StoredWar[] {
  const stored = parseStoredWars(data);
  if (stored === null || now - stored.updatedAt > ACTIVE_WARS_STALE_AFTER_MS) return NONE;
  return stored.wars;
}

export async function loadActiveWars(characterId: number): Promise<readonly StoredWar[]> {
  if (!isSyncConfigured()) return NONE;
  if (lastRead === null || Date.now() - lastRead.at >= ACTIVE_WARS_POLL_MS) {
    // One read at a time: the Overview and the Corp page asking together share it.
    reading ??= readList(characterId).finally(() => {
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
