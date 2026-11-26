import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import type { NearbyRouteRules } from './nearbyAlerts.js';
import type { NearbyDevice, NearbyDeviceState, NearbyStore } from './pollNearby.js';
import {
  DEVICE_REGISTRATIONS_COLLECTION,
  SERVER_EVENTS_FIELD,
  SERVER_INPUTS_FIELD,
  readQuietHours,
} from './projectionStore.js';
import {
  createRegistrationReader,
  registeredAtMs,
  type RegistrationReader,
} from './registrationReader.js';
import type { RunStats } from './runStats.js';

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

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

export function firestoreNearbyStore(
  db: Firestore,
  options: {
    registrations?: RegistrationReader;
    stats?: RunStats;
  } = {}
): NearbyStore {
  const registrations = db.collection(DEVICE_REGISTRATIONS_COLLECTION);
  const { stats } = options;
  const reader = options.registrations ?? createRegistrationReader(db, stats);
  return {
    async devicesFor(characterIds) {
      const devices: NearbyDevice[] = [];
      for (const { id, data } of await reader.holding(characterIds)) {
        if (typeof data.fcmToken !== 'string') continue;
        devices.push({
          deviceId: id,
          fcmToken: data.fcmToken,
          characterIds: Array.isArray(data.characterIds)
            ? data.characterIds.filter((c): c is number => typeof c === 'number')
            : [],
          serverEventsByCharacter: asRecord(
            data[SERVER_EVENTS_FIELD]
          ) as NearbyDevice['serverEventsByCharacter'],
          nearbyJumpsByCharacter: nearbyJumpsOf(data[SERVER_INPUTS_FIELD]),
          routeRules: data.routeRules as NearbyRouteRules | undefined,
          quietHours: readQuietHours(data.quietHours),
          updatedAtMs: registeredAtMs(data),
          state: readNearbyState(data.nearbyState),
        });
      }
      return devices;
    },
    async writeState(deviceId, state) {
      await registrations.doc(deviceId).update({ nearbyState: state });
      stats?.add('firestoreWrites');
    },
    async deleteDevice(deviceId) {
      await registrations.doc(deviceId).delete();
      stats?.add('firestoreWrites');
      reader.forget(deviceId);
    },
  };
}

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
