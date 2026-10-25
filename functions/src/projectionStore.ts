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
import { suppressPush, type QuietHours } from './quietHours.js';
import type { NearbyEventId, NearbyRouteRules } from './nearbyAlerts.js';

export const PROJECTIONS_COLLECTION = 'projections';
export const DEVICE_REGISTRATIONS_COLLECTION = 'deviceRegistrations';

/**
 * Set on a registration doc once its device has uploaded per-device rows. A
 * registration without it predates #2240, so its Characters may still have
 * legacy (deviceId-less) rows to sweep — see `writeDeviceRegistration`.
 */
export const PER_DEVICE_MARKER = 'perDeviceProjections';

/** Every field `writeDeviceRegistration` owns; anything else on the doc (the poller's `nearbyState`) is left alone. */
const REGISTRATION_FIELDS = [
  'fcmToken',
  'characterIds',
  'eveTypesByCharacter',
  'serverEventsByCharacter',
  'nearbyJumpsByCharacter',
  'routeRules',
  'quietHours',
  'updatedAt',
  PER_DEVICE_MARKER,
];

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
  /**
   * Verified Characters' browser-enabled ESI types from this device (issue
   * #3755, ADR 0020). Stored on this device's own registration doc, so a
   * `set` replaces only this device's lists.
   */
  eveTypesByCharacter: Record<number, string[]>;
  /**
   * Verified Characters' server-pushed event ids and nearby N from this
   * device (issues #5121, #5122). A Character with no entry keeps what this
   * device stored before (an older client sends none).
   */
  serverEventsByCharacter?: Record<number, string[]>;
  nearbyJumpsByCharacter?: Record<number, Partial<Record<NearbyEventId, number>>>;
  /** This device's Travel Settings (issue #5122); `undefined` keeps the stored ones. */
  routeRules?: NearbyRouteRules;
  /**
   * This device's quiet time (issue #4566). `undefined` (an older client)
   * keeps what the registration already stores; `null` clears it.
   */
  quietHours?: QuietHours | null;
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

/** Same fields and values. */
function sameRow(a: object, b: object): boolean {
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(right);
  return Object.keys(left).length === keys.length && keys.every((k) => left[k] === right[k]);
}

/**
 * Write one device's registration and sync its Projection, per Character:
 *
 * - this device's unfired rows for that Character are diffed against the
 *   upload: only new or changed rows are written, only rows no longer present
 *   are deleted, identical rows are untouched — other devices' rows and every
 *   fired row are left alone;
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
  // An upload without a list (an older client) keeps what this device stored.
  const previousEveTypes: Record<string, string[]> =
    typeof previous?.eveTypesByCharacter === 'object' && previous.eveTypesByCharacter !== null
      ? (previous.eveTypesByCharacter as Record<string, string[]>)
      : {};
  const previousMap = <T>(field: string): Record<string, T> =>
    typeof previous?.[field] === 'object' && previous[field] !== null
      ? (previous[field] as Record<string, T>)
      : {};
  const perCharacter = <T>(field: string, uploaded: Record<number, T> | undefined) => {
    const stored = previousMap<T>(field);
    return Object.fromEntries(
      write.characterIds.flatMap((id) => {
        const value = uploaded?.[id] ?? stored[String(id)];
        return value === undefined ? [] : [[String(id), value]];
      })
    );
  };
  const routeRules = write.routeRules ?? (previous?.routeRules as NearbyRouteRules | undefined);
  // An upload without a window keeps the stored one; `null` drops it (`set`
  // below rebuilds the doc, so an omitted field is a deleted one).
  const quietHours =
    write.quietHours === undefined ? readQuietHours(previous?.quietHours) : write.quietHours;
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
  await registrationRef.set(
    {
      fcmToken: write.fcmToken,
      characterIds: write.characterIds,
      // Firestore map keys are strings; a Character dropped from the roster
      // falls out because the whole map is rebuilt on every upload.
      eveTypesByCharacter: Object.fromEntries(
        write.characterIds.map((id) => [
          String(id),
          write.eveTypesByCharacter[id] ?? previousEveTypes[String(id)] ?? [],
        ])
      ),
      serverEventsByCharacter: perCharacter(
        'serverEventsByCharacter',
        write.serverEventsByCharacter
      ),
      nearbyJumpsByCharacter: perCharacter('nearbyJumpsByCharacter', write.nearbyJumpsByCharacter),
      ...(routeRules ? { routeRules } : {}),
      ...(quietHours ? { quietHours } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    },
    {
      // Every field this upload owns is rewritten (a listed field left out is
      // deleted, as a plain `set` would); the poller's `nearbyState`
      // (pollNearby.ts) is not listed, so a concurrent poll's write survives.
      mergeFields: REGISTRATION_FIELDS,
    }
  );

  await Promise.all([
    ...write.projections.map(async ({ characterId, rows }) => {
      const own = await ownUnfired(characterId);
      const legacy = sweepLegacy(characterId) ? await legacyUnfired(characterId) : [];
      const existing = new Map(own.map((doc) => [doc.id, doc.data()]));
      const kept = new Set<string>();
      const ops: ((b: WriteBatch) => void)[] = legacy.map((doc) => (b) => b.delete(doc.ref));
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
        const id = projectionDocId(write.deviceId, row.occurrenceKey);
        kept.add(id);
        // A heartbeat re-upload is mostly identical rows: leave those alone.
        const current = existing.get(id);
        if (current && sameRow(current, stored)) continue;
        const ref = projections.doc(id);
        ops.push((b) => b.set(ref, stored));
      }
      for (const doc of own) {
        if (!kept.has(doc.id)) ops.push((b) => b.delete(doc.ref));
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
  quietHours?: QuietHours;
}

/** A stored window, or undefined when absent or not the shape `parseQuietHours` writes. */
export function readQuietHours(raw: unknown): QuietHours | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const { start, end, timeZone, allowAttacks } = raw as Record<string, unknown>;
  if (typeof start !== 'string' || typeof end !== 'string' || typeof timeZone !== 'string') {
    return undefined;
  }
  return { start, end, timeZone, allowAttacks: allowAttacks === true };
}

/**
 * Fire every due row (`purgeFiredProjections` purges old ones). Per row, in
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
      quietHours: readQuietHours(data.quietHours),
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
      // silence (GLOSSARY round 45) — delete unsent rather than send.
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

      // Quiet time (issue #4566): a device inside its window is skipped, not
      // queued. The row is marked fired below, so it is never pushed late and
      // still reaches the Alerts list through the feed sync.
      const awake = targets.filter((device) => !suppressPush(now, device.quietHours, row.eveType));
      if (targets.length > 0 && awake.length === 0) {
        await doc.ref.update({ fired: true, firedAt: now });
        return;
      }

      const data = buildPushData(row);
      const sent = await Promise.all(awake.map((device) => sendTo(device, data)));

      // Only mark fired once a device actually received it — every send
      // failing on a transient error leaves the row unfired so the next
      // 5-minute tick retries it. The 7-day stale check above is what
      // eventually gives up, never a silently "delivered" row nobody got.
      if (sent.some(Boolean)) {
        await doc.ref.update({ fired: true, firedAt: now });
      }
    })
  );
}

/**
 * Fired rows are kept as the backend's half of the Notification Feed, then
 * purged like every other Feed row (round 20/45) — mirrors `isPastRetention`
 * as a query filter, same reasoning as `isDue` in `dispatchDueProjections`.
 * A task of `dailyHousekeeping`, not of every dispatch tick: the retention is
 * 30 days, so a day's lag is nothing, and an empty query is still a billed read.
 */
export async function purgeFiredProjections(
  db: Firestore,
  now: number,
  limits: { pageSize?: number; maxPasses?: number } = {}
): Promise<{ deleted: number; truncated: boolean }> {
  // Bounded like the Notification Feed purge (decision 20260907-235147): a
  // day's backlog in one run must not outgrow memory or the shared timeout.
  const pageSize = limits.pageSize ?? FIRED_PURGE_PAGE_SIZE;
  const maxPasses = limits.maxPasses ?? FIRED_PURGE_MAX_PASSES;
  const query = db
    .collection(PROJECTIONS_COLLECTION)
    .where('fired', '==', true)
    .where('firedAt', '<', now - FIRED_RETENTION_MS)
    .limit(pageSize);
  let deleted = 0;
  for (let pass = 0; pass < maxPasses; pass += 1) {
    const page = await query.get();
    await commitInChunks(
      db,
      page.docs.map((doc) => (b) => b.delete(doc.ref))
    );
    deleted += page.docs.length;
    if (page.docs.length < pageSize) return { deleted, truncated: false };
  }
  return { deleted, truncated: true };
}

/** Fired projections deleted per page, and pages per run (the rest waits a day). */
export const FIRED_PURGE_PAGE_SIZE = 500;
export const FIRED_PURGE_MAX_PASSES = 20;
