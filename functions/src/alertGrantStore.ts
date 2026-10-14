// Firestore side of the Alerts Grant (issue #3753, ADR 0020): `alertGrants/{characterId}`,
// function-only (firestore.rules denies every client). Logic lives in alertGrant.ts.

import type { Firestore } from 'firebase-admin/firestore';
import type { AlertGrantDoc, AlertGrantStore } from './alertGrant.js';

export const ALERT_GRANTS_COLLECTION = 'alertGrants';

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
