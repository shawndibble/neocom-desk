// The Firestore side of server-pushed events (issue #5121): which devices want
// an event for a Character, pushing one fire to them, the polled tick's device
// list and readings, and the community triggers' document reads. index.ts keeps
// only the `onSchedule`/`onDocumentCreated` wiring; the decisions are in
// serverEvents.ts, communityPush.ts and serverEventPoll.ts.

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
import {
  joinRequestFire,
  memberJoinedFire,
  requestPledgedFire,
  type CommunityDoc,
  type ItemRequestDoc,
} from './communityPush.js';
import { COMMUNITIES_COLLECTION, COMMUNITY_MEMBERS_COLLECTION } from './communities.js';
import { REQUESTS_COLLECTION as ITEM_REQUESTS_COLLECTION } from './communityRequests.js';

type Log = (message: string, meta?: Record<string, unknown>) => void;

function record<T>(raw: unknown): Record<string, T> {
  return typeof raw === 'object' && raw !== null ? (raw as Record<string, T>) : {};
}

function stringList(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
}

/**
 * Push one fire to every device that holds its Character and enabled its event
 * for the browser channel, outside the device's quiet time. A dead token
 * deletes the registration, as the other two send paths do. Returns how many
 * devices received it.
 */
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
        if (shouldDeleteDeviceToken(code, message)) await doc.ref.delete();
        else log('Server event push failed', { deviceId: doc.id, error: code || message });
      }
    })
  );
  return sent;
}

/** The polled tick's devices: those with a price alert or ship-lost event on for some Character. */
export async function listPolledDevices(db: Firestore): Promise<PolledDevice[]> {
  const snap = await db
    .collection(DEVICE_REGISTRATIONS_COLLECTION)
    .where(POLLED_EVENTS_FIELD, 'array-contains-any', [...POLLED_EVENT_IDS])
    .get();
  const devices: PolledDevice[] = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    if (typeof data.fcmToken !== 'string') continue;
    const events = record<unknown>(data[SERVER_EVENTS_FIELD]);
    const inputs = record<ServerEventInputs>(data[SERVER_INPUTS_FIELD]);
    const baselines = record<ServerEventBaseline>(data[SERVER_BASELINES_FIELD]);
    const characterIds: unknown[] = Array.isArray(data.characterIds) ? data.characterIds : [];
    const quietHours = readQuietHours(data.quietHours);
    devices.push({
      deviceId: doc.id,
      fcmToken: data.fcmToken,
      ...(quietHours ? { quietHours } : {}),
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

/**
 * Replaces the device's readings. `update`, not `set`, so a registration
 * written meanwhile keeps its other fields; a device deleted meanwhile (logged
 * out, dead token) is left deleted.
 */
export async function saveServerBaselines(
  db: Firestore,
  deviceId: string,
  baselines: Record<string, ServerEventBaseline>
): Promise<void> {
  try {
    await db
      .collection(DEVICE_REGISTRATIONS_COLLECTION)
      .doc(deviceId)
      .update(new FieldPath(SERVER_BASELINES_FIELD), baselines);
  } catch (err) {
    const code = err instanceof Error && 'code' in err ? (err as { code: unknown }).code : null;
    // 5 = NOT_FOUND: the device is gone, nothing to keep a reading for.
    if (code !== 5 && code !== 'not-found') throw err;
  }
}

const communityRef = (db: Firestore, communityId: string) =>
  db.collection(COMMUNITIES_COLLECTION).doc(communityId);

/** A doc created directly under a Community: a join request or a new Member. */
export async function onCommunityChildCreated(
  db: Firestore,
  sender: PushSender,
  params: { communityId: string; collection: string; docId: string },
  data: Record<string, unknown>,
  nowMs: number,
  log: Log
): Promise<void> {
  // `requests` is the waiting list (communitiesStore.ts's layout), not `itemRequests`.
  const isRequest = params.collection === 'requests';
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

/** A Pledge doc created on a Request: its requester is told. */
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
