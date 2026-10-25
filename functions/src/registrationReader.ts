// One read of `deviceRegistrations` per Character per run (issue #5144),
// shared by the Alerts poller's grant planning and its nearby phase, which both
// need the same documents. Held for one run only: build it inside the
// scheduled handler, never at module scope.

import type { Firestore } from 'firebase-admin/firestore';
import { DEVICE_REGISTRATIONS_COLLECTION } from './projectionStore.js';
import type { RunStats } from './runStats.js';

/** Firestore's cap on `array-contains-any` values. */
const ARRAY_CONTAINS_ANY_MAX = 30;

export interface RegisteredDevice {
  id: string;
  data: Record<string, unknown>;
}

export interface RegistrationReader {
  /** Every registration holding one of these Characters; each Character is queried once per reader. */
  holding(characterIds: readonly number[]): Promise<RegisteredDevice[]>;
  /** A registration deleted during the run (dead token) is not offered again. */
  forget(deviceId: string): void;
}

/** A registration doc's last write, in epoch ms (`updatedAt`, stamped by `registerDevice`). */
export function registeredAtMs(data: Record<string, unknown>): number | null {
  const stamp = data.updatedAt as { toMillis?: () => number } | number | null | undefined;
  if (typeof stamp === 'number' && Number.isFinite(stamp)) return stamp;
  return typeof stamp === 'object' && stamp !== null && typeof stamp.toMillis === 'function'
    ? stamp.toMillis()
    : null;
}

export function createRegistrationReader(db: Firestore, stats?: RunStats): RegistrationReader {
  const docs = new Map<string, Record<string, unknown>>();
  const queried = new Set<number>();
  return {
    async holding(characterIds) {
      const missing = [...new Set(characterIds)].filter((id) => !queried.has(id));
      for (let i = 0; i < missing.length; i += ARRAY_CONTAINS_ANY_MAX) {
        const chunk = missing.slice(i, i + ARRAY_CONTAINS_ANY_MAX);
        const snap = await db
          .collection(DEVICE_REGISTRATIONS_COLLECTION)
          .where('characterIds', 'array-contains-any', chunk)
          .get();
        // A billed query reads at least one document, even when it finds none.
        stats?.add('firestoreReads', Math.max(1, snap.docs.length));
        for (const doc of snap.docs) docs.set(doc.id, doc.data());
        for (const id of chunk) queried.add(id);
      }
      const wanted = new Set(characterIds);
      return [...docs]
        .filter(([, data]) =>
          Array.isArray(data.characterIds)
            ? data.characterIds.some((id) => typeof id === 'number' && wanted.has(id))
            : false
        )
        .map(([id, data]) => ({ id, data }));
    },
    forget(deviceId) {
      docs.delete(deviceId);
    },
  };
}
