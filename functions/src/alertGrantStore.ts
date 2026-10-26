// Firestore side of the Alerts Grant (issue #3753, ADR 0020): `alertGrants/{characterId}`,
// function-only (firestore.rules denies every client). Logic lives in alertGrant.ts.

import { FieldValue, type Firestore, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import {
  SsoRefreshError,
  type AlertGrantDoc,
  type AlertGrantStore,
  type RefreshedTokens,
} from './alertGrant.js';
import { isFullListingRun } from './pollerEfficiency.js';
import { rotateStoredToken, decryptRefreshToken } from './alertGrantCrypto.js';
import {
  DEVICE_REGISTRATIONS_COLLECTION,
  SERVER_EVENTS_FIELD,
  readQuietHours,
} from './projectionStore.js';
import type { ListedGrant, PollDevice, PollerStore } from './pollEveNotifications.js';
import {
  createRegistrationReader,
  registeredAtMs,
  type RegistrationReader,
} from './registrationReader.js';
import type { RunStats } from './runStats.js';

export const ALERT_GRANTS_COLLECTION = 'alertGrants';

/** Grants per page of the due listing (issue #5236). */
export const DUE_PAGE_SIZE = 300;

/** Firestore side of the poller (issue #3756): see `PollerStore` for the contract. */
export function firestorePollerStore(
  db: Firestore,
  deps: {
    key: () => Buffer;
    refresh: (clientId: string, refreshToken: string) => Promise<RefreshedTokens>;
    /** Counters for this run's log line (issue #5144): in-memory, never written. */
    stats?: RunStats;
    /** Shared with the nearby phase so a registration is read once per run. */
    registrations?: RegistrationReader;
  }
): PollerStore {
  const stats = deps.stats;
  const registrations = deps.registrations ?? createRegistrationReader(db, stats);
  const grants = db.collection(ALERT_GRANTS_COLLECTION);
  const ref = (characterId: number) => grants.doc(String(characterId));
  const guardedUpdate = (
    characterId: number,
    guardBlob: string,
    update: Record<string, unknown>
  ): Promise<void> =>
    db.runTransaction(async (tx) => {
      const snap = await tx.get(ref(characterId));
      stats?.add('firestoreReads');
      const data = snap.data() as AlertGrantDoc | undefined;
      if (data?.encryptedRefreshToken === guardBlob) {
        tx.update(ref(characterId), update);
        stats?.add('firestoreWrites');
      }
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
    // Pages of the grants due now (`nextPollAt <= now`, index status + nextPollAt).
    // A grant with no `nextPollAt` never matches that, so once a day every active
    // grant is read, the missing ones are treated as due and stamped `0`: a grant
    // saved before the field, or by a function version without it, is never lost.
    async listDue(nowMs) {
      const active: ListedGrant[] = [];
      const take = (d: QueryDocumentSnapshot) => {
        const id = Number(d.id);
        if (!Number.isSafeInteger(id)) return;
        const grant = d.data() as AlertGrantDoc;
        listed.set(id, grant);
        active.push({ characterId: id, grant });
      };
      if (isFullListingRun(nowMs)) {
        const snap = await grants.where('status', '==', 'active').get();
        stats?.add('firestoreReads', Math.max(1, snap.docs.length));
        for (const d of snap.docs) {
          const next = (d.data() as AlertGrantDoc).nextPollAt;
          if (typeof next === 'number' && next > nowMs) continue;
          take(d);
          if (typeof next !== 'number') {
            await d.ref.update({ nextPollAt: 0 });
            stats?.add('firestoreWrites');
          }
        }
        return active;
      }
      const due = grants
        .where('status', '==', 'active')
        .where('nextPollAt', '<=', nowMs)
        .orderBy('nextPollAt')
        .limit(DUE_PAGE_SIZE);
      let after: QueryDocumentSnapshot | undefined;
      for (;;) {
        const snap = await (after ? due.startAfter(after) : due).get();
        stats?.add('firestoreReads', Math.max(1, snap.docs.length));
        snap.docs.forEach(take);
        if (snap.docs.length < DUE_PAGE_SIZE) return active;
        after = snap.docs[snap.docs.length - 1];
      }
    },

    async deferNextPoll(characterId, atMs) {
      await ref(characterId).update({ nextPollAt: atMs });
      stats?.add('firestoreWrites');
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
        stats?.add('firestoreReads');
        if (!snap.exists) return { kind: 'skip' };
        grant = snap.data() as AlertGrantDoc;
      }
      if (grant.status !== 'active') return { kind: 'skip' };
      const key = deps.key();
      const current = decryptRefreshToken(grant.encryptedRefreshToken, characterId, key);
      let tokens: RefreshedTokens;
      try {
        stats?.add('ssoRefreshCalls');
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
        stats?.add('firestoreReads');
        const data = latest.data() as AlertGrantDoc | undefined;
        if (data?.encryptedRefreshToken !== grant.encryptedRefreshToken) return false;
        tx.update(ref(characterId), { encryptedRefreshToken: rotated });
        stats?.add('firestoreWrites');
        stats?.add('tokenRotationWrites');
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

    async dropLocationScope(characterId, guard, scopes) {
      await guardedUpdate(characterId, guard, { scopes });
    },

    async patchMail(characterId, guard, state) {
      await guardedUpdate(characterId, guard, state);
    },

    async markIdle(characterId, guard, what) {
      await guardedUpdate(characterId, guard, {
        ...(what.notifications ? { notificationsIdle: true } : {}),
        ...(what.clearMail ? { mailHighWaterId: null, mailEtag: null, mailPushed: [] } : {}),
      });
    },

    async dropMailScope(characterId, guard, scopes) {
      // The mail state goes with the scope: asking for mail again starts unmarked.
      await guardedUpdate(characterId, guard, {
        scopes,
        mailHighWaterId: FieldValue.delete(),
        mailEtag: FieldValue.delete(),
        mailPushed: FieldValue.delete(),
      });
    },

    async devicesForMany(characterIds) {
      const byCharacter = new Map<number, PollDevice[]>();
      for (const { id, data } of await registrations.holding(characterIds)) {
        if (typeof data.fcmToken !== 'string') continue;
        const held = Array.isArray(data.characterIds) ? data.characterIds : [];
        for (const characterId of characterIds) {
          if (!held.includes(characterId)) continue;
          const types = (data.eveTypesByCharacter as Record<string, unknown> | undefined)?.[
            String(characterId)
          ];
          const serverEvents = (data[SERVER_EVENTS_FIELD] as Record<string, unknown> | undefined)?.[
            String(characterId)
          ];
          const device: PollDevice = {
            deviceId: id,
            fcmToken: data.fcmToken,
            eveTypes: Array.isArray(types) ? types.filter((t) => typeof t === 'string') : [],
            serverEvents: Array.isArray(serverEvents)
              ? serverEvents.filter((e) => typeof e === 'string')
              : [],
            quietHours: readQuietHours(data.quietHours),
            updatedAtMs: registeredAtMs(data),
          };
          byCharacter.set(characterId, [...(byCharacter.get(characterId) ?? []), device]);
        }
      }
      return byCharacter;
    },

    async deleteDevice(deviceId) {
      await db.collection(DEVICE_REGISTRATIONS_COLLECTION).doc(deviceId).delete();
      stats?.add('firestoreWrites');
      registrations.forget(deviceId);
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
