import type { Firestore } from 'firebase-admin/firestore';
import { DEVICE_REGISTRATIONS_COLLECTION } from './projectionStore.js';
import type { RunStats } from './runStats.js';
import { chunk } from './chunk.js';

const ARRAY_CONTAINS_ANY_MAX = 30;

export interface RegisteredDevice {
  id: string;
  data: Record<string, unknown>;
}

export interface RegistrationReader {
  holding(characterIds: readonly number[]): Promise<RegisteredDevice[]>;
  forget(deviceId: string): void;
}

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
      for (const ids of chunk(missing, ARRAY_CONTAINS_ANY_MAX)) {
        const snap = await db
          .collection(DEVICE_REGISTRATIONS_COLLECTION)
          .where('characterIds', 'array-contains-any', ids)
          .get();
        stats?.add('firestoreReads', Math.max(1, snap.docs.length));
        for (const doc of snap.docs) docs.set(doc.id, doc.data());
        for (const id of ids) queried.add(id);
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
