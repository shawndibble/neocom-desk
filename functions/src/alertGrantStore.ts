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
  return {
    async listActive() {
      const snap = await grants.where('status', '==', 'active').get();
      return snap.docs.map((d) => Number(d.id)).filter(Number.isSafeInteger);
    },

    // SSO rotates the token, so the SSO call must not run inside a retryable
    // transaction (a retry would redeem the already-rotated token and look like
    // invalid_grant). Read, call SSO once, then write the rotated token back in
    // a transaction that re-reads the doc: if a re-grant replaced the token in
    // the meantime, the rotated one is discarded instead of overwriting it.
    async refresh(characterId) {
      const snap = await ref(characterId).get();
      if (!snap.exists) return { kind: 'skip' };
      const grant = snap.data() as AlertGrantDoc;
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
