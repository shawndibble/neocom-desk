/**
 * Reads the lawless (insurgency) systems list (issue #2870) the
 * `syncLawlessSystems` function keeps in Firestore: CCP's endpoint blocks
 * browser origins, so the app never calls it directly. Public data, so any
 * signed-in session reads it (`ensureAnySession`, as `hubSnapshot.ts` does).
 *
 * Never rejects: a failed read, no sync configured, or a stale or missing
 * snapshot all come back as "none lawless" — the badge hides quietly.
 */
import { doc, getDoc } from 'firebase/firestore/lite';
import { isSyncConfigured } from '@/app/syncStatus';
import { freshLawlessSystems } from '@/engine/route/lawless';
import { getSyncFirestore } from '@/sync/firebaseApp';
import { ensureAnySession } from '@/sync/syncAuth';

const COLLECTION = 'systemConditions';
const DOC_ID = 'lawless';
/** The function writes every 10 minutes: reading it more often only costs reads. */
const REREAD_AFTER_MS = 5 * 60 * 1000;

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

/** The `useLawlessSystems` poll: the same as `REREAD_AFTER_MS`, so each tick can reach Firestore. */
export const LAWLESS_POLL_MS = REREAD_AFTER_MS;

export async function loadLawlessSystems(characterId: number): Promise<ReadonlySet<number>> {
  if (!isSyncConfigured()) return freshLawlessSystems(null, Date.now());
  if (lastRead === null || Date.now() - lastRead.at >= REREAD_AFTER_MS) {
    // One read at a time: the page and a modal asking together share it.
    reading ??= readList(characterId).finally(() => {
      reading = null;
    });
    await reading;
  }
  return freshLawlessSystems(lastRead?.data, Date.now());
}

/** Test seam: forget the last read. */
export function resetLawlessSystemsCache(): void {
  lastRead = null;
  reading = null;
}
