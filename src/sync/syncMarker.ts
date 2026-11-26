import { doc, getDoc, increment, setDoc, type Firestore } from 'firebase/firestore/lite';
import type { SeenSyncMarker } from './localBookkeeping';
import { HOUR_MS } from '@/lib/age';

export const SYNC_MARKER_FIELD = 'syncVersion';

export const SAFETY_RECONCILE_INTERVAL_MS = 3 * HOUR_MS;

export async function readRemoteMarker(firestore: Firestore, uid: string): Promise<number | null> {
  const snapshot = await getDoc(doc(firestore, 'characters', uid));
  const value = snapshot.exists()
    ? (snapshot.data() as Record<string, unknown>)[SYNC_MARKER_FIELD]
    : undefined;
  return typeof value === 'number' ? value : null;
}

export async function bumpRemoteMarker(
  firestore: Firestore,
  uid: string,
  by: 0 | 1
): Promise<void> {
  await setDoc(
    doc(firestore, 'characters', uid),
    { [SYNC_MARKER_FIELD]: increment(by) },
    { merge: true }
  );
}

export function canSkipPass(
  seen: SeenSyncMarker | undefined,
  remote: number | null,
  now: number
): boolean {
  return (
    seen !== undefined &&
    remote !== null &&
    remote === seen.version &&
    now - seen.fullAt < SAFETY_RECONCILE_INTERVAL_MS
  );
}
