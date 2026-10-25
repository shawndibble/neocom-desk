/**
 * Reads the lawless (insurgency) systems list (issue #2870): CCP's endpoint
 * blocks browser origins, so the app never calls it directly. The lawless-systems
 * GitHub Actions job publishes it to R2 (`lawless-systems/systems.json`, plain
 * fetch, no Firebase session). Until that object exists, or when the fetch
 * fails or the copy is stale, it falls back to the doc `syncLawlessSystems`
 * keeps in Firestore (any signed-in session reads it, `ensureAnySession`).
 *
 * Never rejects: a failed read, no sync configured, or a stale or missing
 * snapshot all come back as "none lawless" — the badge hides quietly.
 */
import { isSyncConfigured } from '@/app/syncStatus';
import { freshLawlessSystems, parseFreshLawless } from '@/engine/route/lawless';

export const LAWLESS_R2_URL = 'https://data.neocomdesk.com/lawless-systems/systems.json';
const R2_READ_TIMEOUT_MS = 20_000;
const COLLECTION = 'systemConditions';
const DOC_ID = 'lawless';
/** The job runs every 15 minutes: reading it more often only costs reads. */
const REREAD_AFTER_MS = 5 * 60 * 1000;

let lastRead: { at: number; data: unknown } | null = null;
let reading: Promise<void> | null = null;

/** The R2 copy, or null when it is missing, malformed, stale or cannot be fetched. */
async function readR2(): Promise<unknown> {
  try {
    const res = await fetch(LAWLESS_R2_URL, { signal: AbortSignal.timeout(R2_READ_TIMEOUT_MS) });
    if (!res.ok) return null;
    const body: unknown = await res.json();
    // A stale copy (the job stopped) loses to the Firestore doc, which may be fresher.
    return parseFreshLawless(body, Date.now()) !== null ? body : null;
  } catch {
    return null;
  }
}

async function readList(characterId: number): Promise<void> {
  const fromR2 = await readR2();
  if (fromR2 !== null) {
    lastRead = { at: Date.now(), data: fromR2 };
    return;
  }
  if (!isSyncConfigured()) {
    // Nothing to fall back to: remember the miss so remounts do not refetch R2 every time.
    lastRead = { at: Date.now(), data: null };
    return;
  }
  try {
    // Dynamic: Firebase stays out of the startup graph.
    const [{ doc, getDoc }, { getSyncFirestore }, { ensureAnySession }] = await Promise.all([
      import('firebase/firestore/lite'),
      import('@/sync/firebaseApp'),
      import('@/sync/syncAuth'),
    ]);
    await ensureAnySession(characterId);
    const snapshot = await getDoc(doc(getSyncFirestore(characterId), COLLECTION, DOC_ID));
    lastRead = { at: Date.now(), data: snapshot.data() };
  } catch {
    // Offline or signed out: keep whatever was last read; it still ages out.
  }
}

/** The `useLawlessSystems` poll: the same as `REREAD_AFTER_MS`, so each tick can reach Firestore. */
export const LAWLESS_POLL_MS = REREAD_AFTER_MS;

export async function loadLawlessSystems(characterId: number): Promise<ReadonlySet<number>> {
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
