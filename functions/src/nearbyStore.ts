// Firestore side of the nearby phase (issue #5122, ADR 0028): the registered
// devices that want nearby alerts, read from `deviceRegistrations`, and the
// poller's own `nearbyState` on each registration doc. Logic lives in pollNearby.ts.

import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import type { NearbyRouteRules } from './nearbyAlerts.js';
import type { NearbyDevice, NearbyDeviceState, NearbyStore } from './pollNearby.js';
import {
  DEVICE_REGISTRATIONS_COLLECTION,
  SERVER_EVENTS_FIELD,
  SERVER_INPUTS_FIELD,
  readQuietHours,
} from './projectionStore.js';

/** Firestore's cap on `array-contains-any` values. */
const ARRAY_CONTAINS_ANY_MAX = 30;

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** The poller's stored state on a registration doc; anything malformed reads as none. */
function readNearbyState(raw: unknown): NearbyDeviceState {
  const state = asRecord(raw);
  const pushed: Record<string, number> = {};
  for (const [key, until] of Object.entries(asRecord(state.pushed))) {
    if (typeof until === 'number') pushed[key] = until;
  }
  return {
    characters: asRecord(state.characters) as NearbyDeviceState['characters'],
    pushed,
  };
}

/** Each Character's nearby N, from its `serverInputs` (issue #5121's per-Character inputs). */
function nearbyJumpsOf(raw: unknown): NearbyDevice['nearbyJumpsByCharacter'] {
  return Object.fromEntries(
    Object.entries(asRecord(raw)).map(([id, inputs]) => {
      const { incursionNearbyJumps, skyhookRaidableNearbyJumps } = asRecord(inputs);
      return [
        id,
        {
          ...(typeof incursionNearbyJumps === 'number'
            ? { incursionNearby: incursionNearbyJumps }
            : {}),
          ...(typeof skyhookRaidableNearbyJumps === 'number'
            ? { skyhookRaidableNearby: skyhookRaidableNearbyJumps }
            : {}),
        },
      ];
    })
  );
}

/** Firestore side of the nearby phase (issue #5122): see `NearbyStore`. */
export function firestoreNearbyStore(db: Firestore): NearbyStore {
  const registrations = db.collection(DEVICE_REGISTRATIONS_COLLECTION);
  return {
    async devicesFor(characterIds) {
      const devices = new Map<string, NearbyDevice>();
      for (let i = 0; i < characterIds.length; i += ARRAY_CONTAINS_ANY_MAX) {
        const snap = await registrations
          .where(
            'characterIds',
            'array-contains-any',
            characterIds.slice(i, i + ARRAY_CONTAINS_ANY_MAX)
          )
          .get();
        for (const doc of snap.docs) {
          const data = doc.data();
          if (typeof data.fcmToken !== 'string' || devices.has(doc.id)) continue;
          devices.set(doc.id, {
            deviceId: doc.id,
            fcmToken: data.fcmToken,
            characterIds: Array.isArray(data.characterIds)
              ? data.characterIds.filter((id): id is number => typeof id === 'number')
              : [],
            serverEventsByCharacter: asRecord(
              data[SERVER_EVENTS_FIELD]
            ) as NearbyDevice['serverEventsByCharacter'],
            nearbyJumpsByCharacter: nearbyJumpsOf(data[SERVER_INPUTS_FIELD]),
            routeRules: data.routeRules as NearbyRouteRules | undefined,
            quietHours: readQuietHours(data.quietHours),
            state: readNearbyState(data.nearbyState),
          });
        }
      }
      return [...devices.values()];
    },
    async writeState(deviceId, state) {
      // `update`, not `set`: a registration deleted meanwhile (a dead token) must
      // stay deleted, so this throws instead of recreating a doc with no token.
      await registrations.doc(deviceId).update({ nearbyState: state });
    },
    async deleteDevice(deviceId) {
      await registrations.doc(deviceId).delete();
    },
  };
}

/**
 * Drop one Character's nearby state from every device that holds it: the
 * Alerts Grant was deleted, so the system it was last counted from goes too.
 */
export async function forgetNearbyCharacter(db: Firestore, characterId: number): Promise<void> {
  const snap = await db
    .collection(DEVICE_REGISTRATIONS_COLLECTION)
    .where('characterIds', 'array-contains', characterId)
    .get();
  await Promise.all(
    snap.docs
      .filter((doc) => readNearbyState(doc.data().nearbyState).characters[String(characterId)])
      .map((doc) =>
        doc.ref.update({ [`nearbyState.characters.${characterId}`]: FieldValue.delete() })
      )
  );
}
