// Firestore side of the Alerts Grant (issue #3753, ADR 0020): `alertGrants/{characterId}`,
// function-only (firestore.rules denies every client). Logic lives in alertGrant.ts.

import type { Firestore } from 'firebase-admin/firestore';
import type { AlertGrantDoc, AlertGrantStore, RefreshedTokens } from './alertGrant.js';
import { rotateStoredToken, decryptRefreshToken } from './alertGrantCrypto.js';
import { DEVICE_REGISTRATIONS_COLLECTION } from './projectionStore.js';
import type { PollDevice, PollerStore } from './pollEveNotifications.js';

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
  return {
    async listActive() {
      const snap = await grants.where('status', '==', 'active').get();
      return snap.docs.map((d) => Number(d.id)).filter(Number.isSafeInteger);
    },

    // The rotated token is written in the transaction that read the old one, so
    // a crash after SSO rotates cannot leave the store holding a dead token. A
    // contention retry would re-run the SSO call; that needs a concurrent write
    // to this one doc (a re-grant), which is rare and only costs a re-authorize.
    refresh(characterId) {
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref(characterId));
        if (!snap.exists) return null;
        const grant = snap.data() as AlertGrantDoc;
        if (grant.status !== 'active') return null;
        const key = deps.key();
        const current = decryptRefreshToken(grant.encryptedRefreshToken, characterId, key);
        const tokens = await deps.refresh(grant.clientId, current);
        const rotated = rotateStoredToken(
          grant.encryptedRefreshToken,
          tokens.refreshToken,
          characterId,
          key
        );
        if (rotated !== null) tx.update(ref(characterId), { encryptedRefreshToken: rotated });
        return { accessToken: tokens.accessToken, grant };
      });
    },

    async patch(characterId, state) {
      await ref(characterId).update(state);
    },

    async markRevoked(characterId) {
      await ref(characterId).update({ status: 'revoked' });
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
        });
      }
      return devices;
    },

    async deleteDevice(deviceId) {
      await db.collection(DEVICE_REGISTRATIONS_COLLECTION).doc(deviceId).delete();
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
    async set(characterId, doc) {
      await ref(characterId).set(doc);
    },
    async delete(characterId) {
      await ref(characterId).delete();
    },
  };
}
