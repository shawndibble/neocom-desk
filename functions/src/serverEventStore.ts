import { FieldPath, type Firestore } from 'firebase-admin/firestore';
import { shouldDeleteDeviceToken } from './dispatchProjections.js';
import {
  DEVICE_REGISTRATIONS_COLLECTION,
  POLLED_EVENTS_FIELD,
  SERVER_BASELINES_FIELD,
  SERVER_EVENTS_FIELD,
  SERVER_INPUTS_FIELD,
  readQuietHours,
  type PushSender,
} from './projectionStore.js';
import { suppressPush } from './quietHours.js';
import {
  POLLED_EVENT_IDS,
  buildServerEventPush,
  type ServerEventBaseline,
  type ServerEventFire,
  type ServerEventInputs,
} from './serverEvents.js';
import type { PolledDevice } from './serverEventPoll.js';
import { registeredAtMs } from './registrationReader.js';
import type { RunStats } from './runStats.js';
import {
  joinRequestFire,
  memberJoinedFire,
  requestPledgedFire,
  type CommunityDoc,
  type ItemRequestDoc,
} from './communityPush.js';
import { COMMUNITIES_COLLECTION, COMMUNITY_MEMBERS_COLLECTION } from './communities.js';
import { JOIN_REQUESTS_COLLECTION } from './communitiesStore.js';
import { REQUESTS_COLLECTION as ITEM_REQUESTS_COLLECTION } from './communityRequests.js';

type Log = (message: string, meta?: Record<string, unknown>) => void;

function record<T>(raw: unknown): Record<string, T> {
  return typeof raw === 'object' && raw !== null ? (raw as Record<string, T>) : {};
}

function stringList(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
}

export async function deliverServerEvent(
  db: Firestore,
  sender: PushSender,
  fire: ServerEventFire,
  nowMs: number,
  log: Log = () => {}
): Promise<number> {
  const snap = await db
    .collection(DEVICE_REGISTRATIONS_COLLECTION)
    .where('characterIds', 'array-contains', fire.characterId)
    .get();
  const data = buildServerEventPush(fire, nowMs);
  let sent = 0;
  await Promise.all(
    snap.docs.map(async (doc) => {
      const device = doc.data();
      if (typeof device.fcmToken !== 'string') return;
      const events = stringList(record(device[SERVER_EVENTS_FIELD])[String(fire.characterId)]);
      if (!events.includes(fire.eventId)) return;
      if (suppressPush(nowMs, readQuietHours(device.quietHours), undefined, fire.eventId)) return;
      try {
        await sender.send({ token: device.fcmToken, data });
        sent++;
      } catch (err) {
        const code = err instanceof Error && 'code' in err ? String(err.code) : '';
        const message = err instanceof Error ? err.message : String(err);
        if (shouldDeleteDeviceToken(code, message)) {
          await deleteDeviceIfToken(db, doc.id, device.fcmToken as string);
        } else log('Server event push failed', { deviceId: doc.id, error: code || message });
      }
    })
  );
  return sent;
}

export async function deleteDeviceIfToken(
  db: Firestore,
  deviceId: string,
  fcmToken: string,
  stats?: RunStats
): Promise<void> {
  const ref = db.collection(DEVICE_REGISTRATIONS_COLLECTION).doc(deviceId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    stats?.add('firestoreReads');
    if (snap.exists && snap.get('fcmToken') === fcmToken) {
      tx.delete(ref);
      stats?.add('firestoreWrites');
    }
  });
}

export async function listPolledDevices(db: Firestore, stats?: RunStats): Promise<PolledDevice[]> {
  const snap = await db
    .collection(DEVICE_REGISTRATIONS_COLLECTION)
    .where(POLLED_EVENTS_FIELD, 'array-contains-any', [...POLLED_EVENT_IDS])
    .get();
  stats?.add('firestoreReads', Math.max(1, snap.docs.length));
  const devices: PolledDevice[] = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    if (typeof data.fcmToken !== 'string') continue;
    const events = record<unknown>(data[SERVER_EVENTS_FIELD]);
    const inputs = record<ServerEventInputs>(data[SERVER_INPUTS_FIELD]);
    const baselines = record<ServerEventBaseline>(data[SERVER_BASELINES_FIELD]);
    const characterIds: unknown[] = Array.isArray(data.characterIds) ? data.characterIds : [];
    const quietHours = readQuietHours(data.quietHours);
    const updatedAtMs = registeredAtMs(data);
    devices.push({
      deviceId: doc.id,
      fcmToken: data.fcmToken,
      ...(quietHours ? { quietHours } : {}),
      ...(updatedAtMs !== null ? { updatedAtMs } : {}),
      characters: characterIds
        .filter((id): id is number => typeof id === 'number')
        .map((characterId) => ({
          characterId,
          events: stringList(events[String(characterId)]),
          inputs: inputs[String(characterId)] ?? {},
          baseline: baselines[String(characterId)] ?? {},
        }))
        .filter((character) => POLLED_EVENT_IDS.some((id) => character.events.includes(id))),
    });
  }
  return devices;
}

export async function saveServerBaselines(
  db: Firestore,
  deviceId: string,
  baselines: Record<string, ServerEventBaseline>,
  stats?: RunStats
): Promise<void> {
  try {
    await db
      .collection(DEVICE_REGISTRATIONS_COLLECTION)
      .doc(deviceId)
      .update(new FieldPath(SERVER_BASELINES_FIELD), baselines);
    stats?.add('firestoreWrites');
  } catch (err) {
    const code = err instanceof Error && 'code' in err ? (err as { code: unknown }).code : null;
    if (code !== 5 && code !== 'not-found') throw err;
  }
}

const communityRef = (db: Firestore, communityId: string) =>
  db.collection(COMMUNITIES_COLLECTION).doc(communityId);

export async function onCommunityChildCreated(
  db: Firestore,
  sender: PushSender,
  params: { communityId: string; collection: string; docId: string },
  data: Record<string, unknown>,
  nowMs: number,
  log: Log
): Promise<void> {
  const isRequest = params.collection === JOIN_REQUESTS_COLLECTION;
  const isMember = params.collection === COMMUNITY_MEMBERS_COLLECTION;
  if (!isRequest && !isMember) return;
  const community = (await communityRef(db, params.communityId).get()).data() as
    CommunityDoc | undefined;
  const base = { communityId: params.communityId, community: community ?? null, uid: params.docId };
  const fire = isRequest
    ? joinRequestFire({ ...base, request: data })
    : memberJoinedFire({ ...base, member: data });
  if (fire) await deliverServerEvent(db, sender, fire, nowMs, log);
}

function millis(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const stamp = value as { toMillis?: () => number } | null;
  return typeof stamp?.toMillis === 'function' ? stamp.toMillis() : null;
}

export async function onPledgeCreated(
  db: Firestore,
  sender: PushSender,
  params: { communityId: string; requestId: string; pledgerUid: string },
  data: Record<string, unknown>,
  nowMs: number,
  log: Log
): Promise<void> {
  const pledgedAt = millis(data.updatedAt);
  if (pledgedAt === null) return;
  const community = communityRef(db, params.communityId);
  const [communitySnap, requestSnap, memberSnap] = await Promise.all([
    community.get(),
    community.collection(ITEM_REQUESTS_COLLECTION).doc(params.requestId).get(),
    community.collection(COMMUNITY_MEMBERS_COLLECTION).doc(params.pledgerUid).get(),
  ]);
  const name = memberSnap.get('characterName');
  const communityName = communitySnap.get('name');
  const fire = requestPledgedFire({
    communityId: params.communityId,
    communityName: typeof communityName === 'string' ? communityName : '',
    requestId: params.requestId,
    request: (requestSnap.data() as ItemRequestDoc | undefined) ?? null,
    pledgerUid: params.pledgerUid,
    pledgerName: typeof name === 'string' ? name : '',
    pledgedAt,
    now: nowMs,
  });
  if (fire) await deliverServerEvent(db, sender, fire, nowMs, log);
}
