// Firestore side of the Alerts Grant (issue #3753, ADR 0020): `alertGrants/{characterId}`,
// function-only (firestore.rules denies every client). Logic lives in alertGrant.ts.

import type { Firestore } from 'firebase-admin/firestore';
import {
  SsoRefreshError,
  type AlertGrantDoc,
  type AlertGrantStore,
  type RefreshedTokens,
} from './alertGrant.js';
import { rotateStoredToken, decryptRefreshToken } from './alertGrantCrypto.js';
import { DEVICE_REGISTRATIONS_COLLECTION, readQuietHours } from './projectionStore.js';
import type { PollDevice, PollerStore } from './pollEveNotifications.js';
import type { NearbyDevice, NearbyDeviceState, NearbyStore } from './pollNearby.js';
import type { NearbyRouteRules } from './nearbyAlerts.js';

export const ALERT_GRANTS_COLLECTION = 'alertGrants';

/** Firestore side of the poller (issue #3756): see `PollerStore` for the contract. */
export function firestorePollerStore(
  db: Firestore,
  deps: {
    key: () => Buffer;
    refresh: (clientId: string, refreshToken: string) => Promise<RefreshedTokens>;
  }
): PollerStore {
  const grants = db.collection(ALERT_GRANTS_COLLECTION);
  const ref = (characterId: number) => grants.doc(String(characterId));
  const guardedUpdate = (
    characterId: number,
    guardBlob: string,
    update: Record<string, unknown>
  ): Promise<void> =>
    db.runTransaction(async (tx) => {
      const snap = await tx.get(ref(characterId));
      const data = snap.data() as AlertGrantDoc | undefined;
      if (data?.encryptedRefreshToken === guardBlob) tx.update(ref(characterId), update);
    });
  // The store lives for one poll run. The listing already read every active
  // grant in full, so `refresh` starts from that copy instead of reading each
  // doc again; the rotated-token write below still re-reads it in its
  // transaction, so a re-grant since the listing is never overwritten. The
  // copy can be minutes old by the end of a run: a grant the user deleted
  // meanwhile is still tried once, but deleting it also revoked the token at
  // SSO, so that refresh fails and every write stays guarded on the old blob.
  const listed = new Map<number, AlertGrantDoc>();
  return {
    async listActive() {
      const snap = await grants.where('status', '==', 'active').get();
      const ids: number[] = [];
      for (const d of snap.docs) {
        const id = Number(d.id);
        if (!Number.isSafeInteger(id)) continue;
        listed.set(id, d.data() as AlertGrantDoc);
        ids.push(id);
      }
      return ids;
    },

    // SSO rotates the token, so the SSO call must not run inside a retryable
    // transaction (a retry would redeem the already-rotated token and look like
    // invalid_grant). Read, call SSO once, then write the rotated token back in
    // a transaction that re-reads the doc: if a re-grant replaced the token in
    // the meantime, the rotated one is discarded instead of overwriting it.
    async refresh(characterId) {
      let grant = listed.get(characterId);
      listed.delete(characterId);
      if (!grant) {
        const snap = await ref(characterId).get();
        if (!snap.exists) return { kind: 'skip' };
        grant = snap.data() as AlertGrantDoc;
      }
      if (grant.status !== 'active') return { kind: 'skip' };
      const key = deps.key();
      const current = decryptRefreshToken(grant.encryptedRefreshToken, characterId, key);
      let tokens: RefreshedTokens;
      try {
        tokens = await deps.refresh(grant.clientId, current);
      } catch (err) {
        if (err instanceof SsoRefreshError && err.invalidGrant) {
          await guardedUpdate(characterId, grant.encryptedRefreshToken, { status: 'revoked' });
          return { kind: 'revoked' };
        }
        throw err;
      }
      const rotated = rotateStoredToken(
        grant.encryptedRefreshToken,
        tokens.refreshToken,
        characterId,
        key
      );
      if (rotated === null) return { kind: 'ok', accessToken: tokens.accessToken, grant };
      const written = await db.runTransaction(async (tx) => {
        const latest = await tx.get(ref(characterId));
        const data = latest.data() as AlertGrantDoc | undefined;
        if (data?.encryptedRefreshToken !== grant.encryptedRefreshToken) return false;
        tx.update(ref(characterId), { encryptedRefreshToken: rotated });
        return true;
      });
      if (!written) return { kind: 'skip' };
      return {
        kind: 'ok',
        accessToken: tokens.accessToken,
        grant: { ...grant, encryptedRefreshToken: rotated },
      };
    },

    // Poller writes are guarded on the token it refreshed with: a re-grant that
    // landed during the ESI/FCM calls keeps its fresh state.
    async patch(characterId, guard, state) {
      await guardedUpdate(characterId, guard, state);
    },

    async markRevoked(characterId, guard) {
      await guardedUpdate(characterId, guard, { status: 'revoked' });
    },

    async devicesFor(characterId) {
      const snap = await db
        .collection(DEVICE_REGISTRATIONS_COLLECTION)
        .where('characterIds', 'array-contains', characterId)
        .get();
      const devices: PollDevice[] = [];
      for (const doc of snap.docs) {
        const data = doc.data();
        if (typeof data.fcmToken !== 'string') continue;
        const byCharacter = data.eveTypesByCharacter as Record<string, unknown> | undefined;
        const types = byCharacter?.[String(characterId)];
        devices.push({
          deviceId: doc.id,
          fcmToken: data.fcmToken,
          eveTypes: Array.isArray(types) ? types.filter((t) => typeof t === 'string') : [],
          quietHours: readQuietHours(data.quietHours),
        });
      }
      return devices;
    },

    async deleteDevice(deviceId) {
      await db.collection(DEVICE_REGISTRATIONS_COLLECTION).doc(deviceId).delete();
    },
  };
}

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
              data.serverEventsByCharacter
            ) as NearbyDevice['serverEventsByCharacter'],
            nearbyJumpsByCharacter: asRecord(
              data.nearbyJumpsByCharacter
            ) as NearbyDevice['nearbyJumpsByCharacter'],
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

export function firestoreAlertGrantStore(db: Firestore): AlertGrantStore {
  const ref = (characterId: number) =>
    db.collection(ALERT_GRANTS_COLLECTION).doc(String(characterId));
  return {
    async get(characterId) {
      const snap = await ref(characterId).get();
      return snap.exists ? (snap.data() as AlertGrantDoc) : null;
    },
    async getMany(characterIds) {
      const found = new Map<number, AlertGrantDoc | null>();
      if (characterIds.length === 0) return found;
      const snaps = await db.getAll(...characterIds.map(ref));
      snaps.forEach((snap, i) => {
        found.set(characterIds[i], snap.exists ? (snap.data() as AlertGrantDoc) : null);
      });
      return found;
    },
    async set(characterId, doc) {
      await ref(characterId).set(doc);
    },
    async delete(characterId) {
      await ref(characterId).delete();
    },
  };
}
