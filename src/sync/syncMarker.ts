// The per-Character change marker (issue #5073): one counter, `syncVersion`, on
// the `characters/{uid}` parent doc. A pass that pushes anything bumps it after
// the pushes landed; an idle background pass reads just this doc (1 read) and
// stops when it still equals what this device saw at its last full pass,
// instead of querying every synced collection.
//
// Bumped *after* the writes, never before: a reader that sees the new value
// must find the data already there. A crash between the two leaves a missed
// bump, which `SAFETY_RECONCILE_INTERVAL_MS` bounds.

import { doc, getDoc, increment, setDoc, type Firestore } from 'firebase/firestore/lite';
import type { SeenSyncMarker } from './localBookkeeping';
import { HOUR_MS } from '@/lib/age';

export const SYNC_MARKER_FIELD = 'syncVersion';

/**
 * A full pass runs at least this often per Character whatever the marker says,
 * so a bump that never landed (a crash, a function write, a failed bump) cannot
 * hide data for longer.
 */
export const SAFETY_RECONCILE_INTERVAL_MS = 3 * HOUR_MS;

/** The remote marker, or `null` when the parent doc or field does not exist yet. */
export async function readRemoteMarker(firestore: Firestore, uid: string): Promise<number | null> {
  const snapshot = await getDoc(doc(firestore, 'characters', uid));
  const value = snapshot.exists()
    ? (snapshot.data() as Record<string, unknown>)[SYNC_MARKER_FIELD]
    : undefined;
  return typeof value === 'number' ? value : null;
}

/**
 * Add `by` to the marker, creating it. `0` only creates the field (at 0) when
 * missing and leaves an existing value alone.
 */
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

/**
 * Whether a background pass may end here: the marker is unchanged since a full
 * pass this device finished inside the safety interval.
 */
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
