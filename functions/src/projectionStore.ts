import { createHash } from 'node:crypto';
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
import { polledEventsOf, trimBaseline, type ServerEventInputs } from './serverEvents.js';
import type { NearbyRouteRules } from './nearbyAlerts.js';
import { commitInBatches } from './commitInBatches.js';

export const PROJECTIONS_COLLECTION = 'projections';
export const DEVICE_REGISTRATIONS_COLLECTION = 'deviceRegistrations';

export const PER_DEVICE_MARKER = 'perDeviceProjections';

export const PROJECTION_HASHES_FIELD = 'projectionHashes';

const MAX_BATCH_OPS = 500;

export function projectionDocId(deviceId: string, occurrenceKey: string): string {
  return `${deviceId}:${occurrenceKey}`;
}

export interface PushSender {
  send(message: { token: string; data: Record<string, string> }): Promise<string>;
}

export interface DeviceRegistrationWrite {
  deviceId: string;
  fcmToken: string;
  characterIds: number[];
  projections: CharacterProjection[];
  eveTypesByCharacter: Record<number, string[]>;
  quietHours?: QuietHours | null;
  serverEventsByCharacter?: Record<number, string[]>;
  serverInputsByCharacter?: Record<number, ServerEventInputs>;
  routeRules?: NearbyRouteRules;
}

export const SERVER_EVENTS_FIELD = 'serverEventsByCharacter';
export const SERVER_INPUTS_FIELD = 'serverInputsByCharacter';
export const SERVER_BASELINES_FIELD = 'serverEventBaselines';
export const POLLED_EVENTS_FIELD = 'polledServerEvents';
export const ROUTE_RULES_FIELD = 'routeRules';

const REGISTRATION_FIELDS = [
  'fcmToken',
  'characterIds',
  'eveTypesByCharacter',
  'quietHours',
  SERVER_EVENTS_FIELD,
  SERVER_INPUTS_FIELD,
  SERVER_BASELINES_FIELD,
  POLLED_EVENTS_FIELD,
  ROUTE_RULES_FIELD,
  'updatedAt',
  PER_DEVICE_MARKER,
];

function mapField<T>(raw: unknown): Record<string, T> {
  return typeof raw === 'object' && raw !== null ? (raw as Record<string, T>) : {};
}

type Doc = QueryDocumentSnapshot;
type Ref = DocumentReference;

function sameRow(a: object, b: object): boolean {
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(right);
  return Object.keys(left).length === keys.length && keys.every((k) => left[k] === right[k]);
}

function hashRows(rows: CharacterProjection['rows']): string {
  const canonical = [...rows]
    .sort((a, b) =>
      a.occurrenceKey < b.occurrenceKey ? -1 : a.occurrenceKey > b.occurrenceKey ? 1 : 0
    )
    .map((r) => [r.eventId, r.occurrenceKey, r.fireAt, r.title, r.body, r.eveType ?? null]);
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

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
  const previousEveTypes: Record<string, string[]> =
    typeof previous?.eveTypesByCharacter === 'object' && previous.eveTypesByCharacter !== null
      ? (previous.eveTypesByCharacter as Record<string, string[]>)
      : {};
  const quietHours =
    write.quietHours === undefined ? readQuietHours(previous?.quietHours) : write.quietHours;
  const routeRules =
    write.routeRules ?? (previous?.[ROUTE_RULES_FIELD] as NearbyRouteRules | undefined);
  const previousServerEvents = mapField<string[]>(previous?.[SERVER_EVENTS_FIELD]);
  const previousServerInputs = mapField<ServerEventInputs>(previous?.[SERVER_INPUTS_FIELD]);
  const previousBaselines = mapField<unknown>(previous?.[SERVER_BASELINES_FIELD]);
  const serverEventsByCharacter = Object.fromEntries(
    write.characterIds.map((id) => [
      String(id),
      write.serverEventsByCharacter?.[id] ?? previousServerEvents[String(id)] ?? [],
    ])
  );
  const keep = <T>(byId: Record<string, T>, fresh?: Record<number, T>): Record<string, T> =>
    Object.fromEntries(
      write.characterIds.flatMap((id) => {
        const value = fresh?.[id] ?? byId[String(id)];
        return value === undefined ? [] : [[String(id), value]];
      })
    );
  const previousHashes = mapField<string>(previous?.[PROJECTION_HASHES_FIELD]);
  const hashes: Record<string, string> = {};
  const droppedIds = previousIds.filter((id) => !write.characterIds.includes(id));
  const sweepLegacy = (characterId: number): boolean =>
    !marked || !previousIds.includes(characterId);

  const ownUnfired = (characterId: number): Promise<Doc[]> =>
    projections
      .where('deviceId', '==', write.deviceId)
      .where('characterId', '==', characterId)
      .where('fired', '==', false)
      .get()
      .then((s) => s.docs);

  const legacyUnfired = (characterId: number): Promise<Doc[]> =>
    projections
      .where('characterId', '==', characterId)
      .where('fired', '==', false)
      .get()
      .then((s) => s.docs.filter((d) => d.data().deviceId === undefined));

  const registration: Record<string, unknown> = {
    fcmToken: write.fcmToken,
    characterIds: write.characterIds,
    eveTypesByCharacter: Object.fromEntries(
      write.characterIds.map((id) => [
        String(id),
        write.eveTypesByCharacter[id] ?? previousEveTypes[String(id)] ?? [],
      ])
    ),
    ...(quietHours ? { quietHours } : {}),
    [SERVER_EVENTS_FIELD]: serverEventsByCharacter,
    [SERVER_INPUTS_FIELD]: keep(previousServerInputs, write.serverInputsByCharacter),
    [SERVER_BASELINES_FIELD]: Object.fromEntries(
      Object.entries(keep(previousBaselines)).map(([id, baseline]) => [
        id,
        trimBaseline(baseline, serverEventsByCharacter[id] ?? []),
      ])
    ),
    [POLLED_EVENTS_FIELD]: polledEventsOf(serverEventsByCharacter),
    ...(routeRules ? { [ROUTE_RULES_FIELD]: routeRules } : {}),
    updatedAt: FieldValue.serverTimestamp(),
  };
  for (const field of REGISTRATION_FIELDS) {
    if (!(field in registration)) registration[field] = FieldValue.delete();
  }
  await registrationRef.set(registration, { mergeFields: REGISTRATION_FIELDS });

  await Promise.all([
    ...write.projections.map(async ({ characterId, rows }) => {
      const hash = hashRows(rows);
      hashes[String(characterId)] = hash;
      if (!sweepLegacy(characterId) && previousHashes[String(characterId)] === hash) return;
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
        const current = existing.get(id);
        if (current && sameRow(current, stored)) continue;
        const ref = projections.doc(id);
        ops.push((b) => b.set(ref, stored));
      }
      for (const doc of own) {
        if (!kept.has(doc.id)) ops.push((b) => b.delete(doc.ref));
      }
      await commitInBatches(db, ops, MAX_BATCH_OPS);
    }),
    ...droppedIds.map(async (characterId) => {
      const docs = await ownUnfired(characterId);
      await commitInBatches(
        db,
        docs.map((doc) => (b: WriteBatch) => b.delete(doc.ref)),
        MAX_BATCH_OPS
      );
    }),
  ]);

  for (const id of write.characterIds) {
    const kept = previousHashes[String(id)];
    if (!(String(id) in hashes) && kept !== undefined) hashes[String(id)] = kept;
  }
  await registrationRef.update({ [PER_DEVICE_MARKER]: true, [PROJECTION_HASHES_FIELD]: hashes });
}

interface Registration {
  ref: Ref;
  id: string;
  fcmToken: string;
  characterIds: number[];
  quietHours?: QuietHours;
}

export function readQuietHours(raw: unknown): QuietHours | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const { start, end, timeZone, allowAttacks } = raw as Record<string, unknown>;
  if (typeof start !== 'string' || typeof end !== 'string' || typeof timeZone !== 'string') {
    return undefined;
  }
  return { start, end, timeZone, allowAttacks: allowAttacks === true };
}

export async function dispatchDueProjections(
  db: Firestore,
  messaging: PushSender,
  now: number,
  logError: (message: string, meta: unknown) => void = () => {},
  limits: { pageSize?: number; maxPasses?: number } = {}
): Promise<void> {
  const pageSize = limits.pageSize ?? DISPATCH_PAGE_SIZE;
  const maxPasses = limits.maxPasses ?? DISPATCH_MAX_PASSES;
  const projections = db.collection(PROJECTIONS_COLLECTION);
  const registrations = db.collection(DEVICE_REGISTRATIONS_COLLECTION);

  const dueQuery = projections
    .where('fired', '==', false)
    .where('fireAt', '<=', now)
    .orderBy('fireAt')
    .limit(pageSize);

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

  const byDevice = new Map<string, Promise<Registration | null>>();
  const registrationOf = (deviceId: string): Promise<Registration | null> => {
    let pending = byDevice.get(deviceId);
    if (!pending) {
      pending = registrations.doc(deviceId).get().then(toRegistration);
      byDevice.set(deviceId, pending);
    }
    return pending;
  };

  const byCharacter = new Map<number, Promise<Registration[]>>();
  const deadDevices = new Set<string>();
  const holdersOf = (characterId: number): Promise<Registration[]> => {
    let pending = byCharacter.get(characterId);
    if (!pending) {
      pending = registrations
        .where('characterIds', 'array-contains', characterId)
        .get()
        .then((holders) =>
          holders.docs.map(toRegistration).filter((r): r is Registration => r !== null)
        );
      byCharacter.set(characterId, pending);
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
        byDevice.set(device.id, Promise.resolve(null));
        deadDevices.add(device.id);
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

  const dispatchRow = async (doc: QueryDocumentSnapshot): Promise<void> => {
    const row = doc.data() as StoredProjectionRow;

    if (isStaleUnsent(row, now)) {
      await doc.ref.delete();
      return;
    }

    let targets: Registration[];
    if (row.deviceId === undefined) {
      targets = (await holdersOf(row.characterId)).filter((r) => !deadDevices.has(r.id));
    } else {
      const device = await registrationOf(row.deviceId);
      if (!device || !device.characterIds.includes(row.characterId)) {
        await doc.ref.delete();
        return;
      }
      targets = [device];
    }

    const awake = targets.filter((device) => !suppressPush(now, device.quietHours, row.eveType));
    if (targets.length > 0 && awake.length === 0) {
      await doc.ref.update({ fired: true, firedAt: now });
      return;
    }

    const data = buildPushData(row);
    const sent = await Promise.all(awake.map((device) => sendTo(device, data)));

    if (sent.some(Boolean)) {
      await doc.ref.update({ fired: true, firedAt: now });
    }
  };

  let cursor: QueryDocumentSnapshot | undefined;
  for (let pass = 0; pass < maxPasses; pass += 1) {
    const page = await (cursor ? dueQuery.startAfter(cursor) : dueQuery).get();
    await Promise.all(page.docs.map(dispatchRow));
    if (page.docs.length < pageSize) return;
    cursor = page.docs[page.docs.length - 1];
  }
}

export const DISPATCH_PAGE_SIZE = 500;
export const DISPATCH_MAX_PASSES = 10;

export async function purgeFiredProjections(
  db: Firestore,
  now: number,
  limits: { pageSize?: number; maxPasses?: number } = {}
): Promise<{ deleted: number; truncated: boolean }> {
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
    await commitInBatches(
      db,
      page.docs.map((doc) => (b: WriteBatch) => b.delete(doc.ref)),
      MAX_BATCH_OPS
    );
    deleted += page.docs.length;
    if (page.docs.length < pageSize) return { deleted, truncated: false };
  }
  return { deleted, truncated: true };
}

export const FIRED_PURGE_PAGE_SIZE = 500;
export const FIRED_PURGE_MAX_PASSES = 20;
