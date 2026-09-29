// projectionStore: the Firestore side of Scheduled Push (issue #358, ADR
// 0010) — writing one device's registration + Projection, and firing what is
// due. Split out of index.ts so it can be tested against an in-memory
// Firestore; index.ts keeps only the `onCall`/`onSchedule` wiring. The pure
// decisions (due, stale, retention, which FCM errors kill a token) stay in
// dispatchProjections.ts.
//
// Projections are per device (issue #2240, superseding round 45's "replaced
// wholesale" across devices): each row carries its uploader's `deviceId`, a
// device's upload replaces only its own unfired rows, and each row is pushed
// only to that device's token. Rows are built from device-local preferences,
// so one device's Projection says nothing about what another device wants.

import {
  FieldValue,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
  type QueryDocumentSnapshot,
  type WriteBatch,
} from 'firebase-admin/firestore';
import {
  buildPushData,
  isStaleUnsent,
  shouldDeleteDeviceToken,
  FIRED_RETENTION_MS,
  type StoredProjectionRow,
} from './dispatchProjections.js';
import type { CharacterProjection } from './registerDevice.js';

export const PROJECTIONS_COLLECTION = 'projections';
export const DEVICE_REGISTRATIONS_COLLECTION = 'deviceRegistrations';

/**
 * Set on a registration doc once its device has uploaded per-device rows. A
 * registration without it predates #2240, so its Characters may still have
 * legacy (deviceId-less) rows to sweep — see `writeDeviceRegistration`.
 */
export const PER_DEVICE_MARKER = 'perDeviceProjections';

/** Firestore's cap on writes in one batch. */
const MAX_BATCH_OPS = 500;

/** Doc id of one device's row for one occurrence — two devices projecting the same occurrence get two rows. */
export function projectionDocId(deviceId: string, occurrenceKey: string): string {
  return `${deviceId}:${occurrenceKey}`;
}

/** The slice of `firebase-admin/messaging`'s `Messaging` the dispatcher uses. */
export interface PushSender {
  send(message: { token: string; data: Record<string, string> }): Promise<string>;
}

export interface DeviceRegistrationWrite {
  deviceId: string;
  fcmToken: string;
  /** Verified Characters only — replaces the previous list wholesale. */
  characterIds: number[];
  /** Verified Characters' Projections (registerDevice.ts drops rejected ones). */
  projections: CharacterProjection[];
}

type Doc = QueryDocumentSnapshot;
type Ref = DocumentReference;

async function commitInChunks(db: Firestore, ops: ((batch: WriteBatch) => void)[]): Promise<void> {
  for (let i = 0; i < ops.length; i += MAX_BATCH_OPS) {
    const batch = db.batch();
    for (const op of ops.slice(i, i + MAX_BATCH_OPS)) op(batch);
    await batch.commit();
  }
}

/**
 * Write one device's registration and replace its Projection, per Character:
 *
 * - only this device's unfired rows for that Character are deleted and
 *   rewritten — other devices' rows and every fired row are left alone;
 * - this device's unfired rows for a Character it held last time but no
 *   longer does are deleted (roster drift);
 * - on a device's first per-device upload, each held Character's legacy
 *   unfired rows (written before #2240, no `deviceId`) are deleted in the same
 *   batch as the new rows, so no dispatch tick sees both and pushes twice.
 *   Legacy rows nobody sweeps age out through the 7-day stale purge.
 */
export async function writeDeviceRegistration(
  db: Firestore,
  write: DeviceRegistrationWrite
): Promise<void> {
  const projections = db.collection(PROJECTIONS_COLLECTION);
  const registrationRef = db.collection(DEVICE_REGISTRATIONS_COLLECTION).doc(write.deviceId);

  const previous = (await registrationRef.get()).data();
  const marked = previous?.[PER_DEVICE_MARKER] === true;
  const previousIds = Array.isArray(previous?.characterIds)
    ? (previous.characterIds as number[])
    : [];
  const droppedIds = previousIds.filter((id) => !write.characterIds.includes(id));
  // Once per Character per device: on the device's first per-device upload,
  // and again for any Character it adds later, which may still carry another
  // (not yet upgraded) device's legacy rows — left alone, those would fan out
  // to this device on top of its own row.
  const sweepLegacy = (characterId: number): boolean =>
    !marked || !previousIds.includes(characterId);

  const ownUnfired = (characterId: number): Promise<Doc[]> =>
    projections
      .where('deviceId', '==', write.deviceId)
      .where('characterId', '==', characterId)
      .where('fired', '==', false)
      .get()
      .then((s) => s.docs);

  // Firestore cannot query for a missing field, so the legacy sweep reads
  // the Character's unfired rows and keeps those without a deviceId. It runs
  // once per Character per device (`sweepLegacy`), not on every upload.
  const legacyUnfired = (characterId: number): Promise<Doc[]> =>
    projections
      .where('characterId', '==', characterId)
      .where('fired', '==', false)
      .get()
      .then((s) => s.docs.filter((d) => d.data().deviceId === undefined));

  // The registration lands first, without the marker: the dispatcher's
  // drift check then never sees a fresh row for a Character the registration
  // does not list yet, and if a batch below fails, the next upload still
  // sweeps. The marker is set only once every batch has committed.
  await registrationRef.set({
    fcmToken: write.fcmToken,
    characterIds: write.characterIds,
    updatedAt: FieldValue.serverTimestamp(),
  });

  await Promise.all([
    ...write.projections.map(async ({ characterId, rows }) => {
      const stale = [
        ...(await ownUnfired(characterId)),
        ...(sweepLegacy(characterId) ? await legacyUnfired(characterId) : []),
      ];
      const ops: ((b: WriteBatch) => void)[] = stale.map((doc) => (b) => b.delete(doc.ref));
      for (const row of rows) {
        const stored: StoredProjectionRow & { fired: false; firedAt: null } = {
          deviceId: write.deviceId,
          characterId,
          eventId: row.eventId,
          occurrenceKey: row.occurrenceKey,
          fireAt: row.fireAt,
          title: row.title,
          body: row.body,
          ...(row.eveType !== undefined ? { eveType: row.eveType } : {}),
          fired: false,
          firedAt: null,
        };
        const ref = projections.doc(projectionDocId(write.deviceId, row.occurrenceKey));
        ops.push((b) => b.set(ref, stored));
      }
      await commitInChunks(db, ops);
    }),
    ...droppedIds.map(async (characterId) => {
      const docs = await ownUnfired(characterId);
      await commitInChunks(
        db,
        docs.map((doc) => (b) => b.delete(doc.ref))
      );
    }),
  ]);

  await registrationRef.update({ [PER_DEVICE_MARKER]: true });
}

interface Registration {
  ref: Ref;
  id: string;
  fcmToken: string;
  characterIds: number[];
}

/**
 * Fire every due row, then purge fired rows past retention. Per row, in
 * order: stale (>7 days past fireAt) → delete unsent; a device-scoped row
 * whose device has no registration → delete (orphan: its token was deleted
 * after FCM reported it dead — e.g. the device logged out, which deletes its
 * FCM token, and the next send came back UNREGISTERED); whose device no longer lists its Character → delete (roster
 * drift); otherwise push to that one device's token. A legacy row with no
 * `deviceId` is still fanned out to every device holding its Character, as
 * before #2240, until an upload sweeps it or it goes stale.
 */
export async function dispatchDueProjections(
  db: Firestore,
  messaging: PushSender,
  now: number,
  logError: (message: string, meta: unknown) => void = () => {}
): Promise<void> {
  const projections = db.collection(PROJECTIONS_COLLECTION);
  const registrations = db.collection(DEVICE_REGISTRATIONS_COLLECTION);

  // Mirrors dispatchProjections.ts's `isDue` (fireAt <= now) as a Firestore
  // query filter — a Firestore `where` can't call that function directly,
  // but the boundary must stay the same one `isDue`'s own tests pin.
  const dueSnapshot = await projections
    .where('fired', '==', false)
    .where('fireAt', '<=', now)
    .get();

  const toRegistration = (doc: DocumentSnapshot): Registration | null => {
    const data = doc.data();
    if (!data) return null;
    return {
      ref: doc.ref,
      id: doc.id,
      fcmToken: data.fcmToken as string,
      characterIds: Array.isArray(data.characterIds) ? (data.characterIds as number[]) : [],
    };
  };

  // Many due rows share one device per tick; read each registration once.
  const byDevice = new Map<string, Promise<Registration | null>>();
  const registrationOf = (deviceId: string): Promise<Registration | null> => {
    let pending = byDevice.get(deviceId);
    if (!pending) {
      pending = registrations.doc(deviceId).get().then(toRegistration);
      byDevice.set(deviceId, pending);
    }
    return pending;
  };

  const sendTo = async (device: Registration, data: Record<string, string>): Promise<boolean> => {
    try {
      await messaging.send({ token: device.fcmToken, data });
      return true;
    } catch (err) {
      const code = err instanceof Error && 'code' in err ? String(err.code) : '';
      const message = err instanceof Error ? err.message : String(err);
      if (shouldDeleteDeviceToken(code, message)) {
        // Later rows this tick then see the device as an orphan.
        byDevice.set(device.id, Promise.resolve(null));
        await device.ref.delete();
      } else {
        logError('Scheduled Push: send failed', {
          deviceId: device.id,
          error: code || message,
        });
      }
      return false;
    }
  };

  await Promise.all(
    dueSnapshot.docs.map(async (doc) => {
      const row = doc.data() as StoredProjectionRow;

      // Unfired and more than 7 days past fireAt: a device that stopped
      // checking in. A week-late "your skill finished" is worse than
      // silence (CONTEXT round 45) — delete unsent rather than send.
      if (isStaleUnsent(row, now)) {
        await doc.ref.delete();
        return;
      }

      let targets: Registration[];
      if (row.deviceId === undefined) {
        const holders = await registrations
          .where('characterIds', 'array-contains', row.characterId)
          .get();
        targets = holders.docs.map(toRegistration).filter((r): r is Registration => r !== null);
      } else {
        const device = await registrationOf(row.deviceId);
        if (!device || !device.characterIds.includes(row.characterId)) {
          await doc.ref.delete();
          return;
        }
        targets = [device];
      }

      const data = buildPushData(row);
      const sent = await Promise.all(targets.map((device) => sendTo(device, data)));

      // Only mark fired once a device actually received it — every send
      // failing on a transient error leaves the row unfired so the next
      // 5-minute tick retries it. The 7-day stale check above is what
      // eventually gives up, never a silently "delivered" row nobody got.
      if (sent.some(Boolean)) {
        await doc.ref.update({ fired: true, firedAt: now });
      }
    })
  );

  // Fired rows are kept as the backend's half of the Notification Feed, then
  // purged like every other Feed row (round 20/45) — mirrors `isPastRetention`
  // as a query filter, same reasoning as `isDue` above.
  const purgeSnapshot = await projections
    .where('fired', '==', true)
    .where('firedAt', '<', now - FIRED_RETENTION_MS)
    .get();
  await commitInChunks(
    db,
    purgeSnapshot.docs.map((doc) => (b) => b.delete(doc.ref))
  );
}
