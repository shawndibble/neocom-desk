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

export async function loadLawlessSystems(characterId: number): Promise<ReadonlySet<number>> {
  if (!isSyncConfigured()) return freshLawlessSystems(null, Date.now());
  if (lastRead === null || Date.now() - lastRead.at > REREAD_AFTER_MS) {
    try {
      await ensureAnySession(characterId);
      const snapshot = await getDoc(doc(getSyncFirestore(), COLLECTION, DOC_ID));
      lastRead = { at: Date.now(), data: snapshot.data() };
    } catch {
      // Offline or signed out: keep whatever was last read; it still ages out.
    }
  }
  return freshLawlessSystems(lastRead?.data, Date.now());
}

/** Test seam: forget the last read. */
export function resetLawlessSystemsCache(): void {
  lastRead = null;
}
