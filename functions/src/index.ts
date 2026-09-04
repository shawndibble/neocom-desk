// mintFirebaseToken: exchange a verified EVE access token for a Firebase
// custom token. The EVE *refresh* token never reaches this backend (ADR 0001);
// the client sends only its short-lived access token, which is verified
// against EVE's published JWKS before any Firebase credential is minted.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { error as logError } from 'firebase-functions/logger';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import {
  verifyEveAccessToken,
  verifyOptionsFromEnv,
  uidForCharacter,
  type EveTokenClaims,
} from './verifyEveToken.js';
import {
  buildDeviceRegistration,
  parseRegisterDeviceInput,
  type ProjectionRowInput,
} from './registerDevice.js';
import {
  isStaleUnsent,
  shouldDeleteDeviceToken,
  buildPushData,
  FIRED_RETENTION_MS,
  type StoredProjectionRow,
} from './dispatchProjections.js';

initializeApp();

// Built at cold start so a missing EVE_CLIENT_ID fails deployment/startup
// loudly instead of silently accepting any EVE app's tokens per request.
const verifyOptions = verifyOptionsFromEnv();

export const mintFirebaseToken = onCall<{ accessToken?: unknown }>(
  // Hobby-scale abuse cap; also bounds the JWKS fetch fan-out.
  { maxInstances: 5 },
  async (request) => {
    const accessToken = request.data?.accessToken;
    if (typeof accessToken !== 'string' || accessToken.length === 0) {
      throw new HttpsError('invalid-argument', 'accessToken (string) is required');
    }

    let claims: EveTokenClaims;
    try {
      claims = await verifyEveAccessToken(accessToken, verifyOptions);
    } catch (err) {
      // Client response stays opaque (don't leak which validation step
      // failed), but the real cause still needs to be diagnosable from Cloud
      // Logging — the previous bare `catch {}` discarded it entirely.
      logError('EVE access token rejected', { error: err instanceof Error ? err.message : err });
      throw new HttpsError('unauthenticated', 'EVE access token rejected');
    }

    const uid = uidForCharacter(claims.characterId);
    // ownerHash rides along as a custom claim; Firestore rules compare it to the
    // ownerHash field on each doc so a transferred character can't read the
    // previous owner's data.
    const token = await getAuth().createCustomToken(uid, { ownerHash: claims.ownerHash });
    return { token, uid, ownerHash: claims.ownerHash };
  }
);

// registerDevice: register one device's FCM token against every Character it
// holds, in one call — see registerDevice.ts and issue #356. Firestore rules
// deny all client access to `deviceRegistrations`; this admin write is the
// only path in. The doc is a wholesale `set` keyed by the device's own
// (client-generated, device-local) id, never a token-keyed doc — that is what
// makes re-registering after an FCM token rotation replace the entry instead
// of accumulating one per token.
/**
 * Replaces one Character's Projection wholesale (issue #358, CONTEXT.md round
 * 45): every unfired row is deleted, then the newly uploaded set is written.
 * Fired rows are left untouched — they are the backend's half of the
 * Notification Feed (round 45) and are never re-created by a later upload
 * that no longer mentions the same occurrence.
 */
async function replaceCharacterProjection(
  db: Firestore,
  characterId: number,
  rows: readonly ProjectionRowInput[]
): Promise<void> {
  const collection = db.collection('projections');
  const existingUnfired = await collection
    .where('characterId', '==', characterId)
    .where('fired', '==', false)
    .get();

  const batch = db.batch();
  for (const doc of existingUnfired.docs) batch.delete(doc.ref);
  for (const row of rows) {
    batch.set(collection.doc(row.occurrenceKey), {
      characterId,
      eventId: row.eventId,
      occurrenceKey: row.occurrenceKey,
      fireAt: row.fireAt,
      title: row.title,
      body: row.body,
      fired: false,
      firedAt: null,
    });
  }
  await batch.commit();
}

export const registerDevice = onCall<unknown>({ maxInstances: 5 }, async (request) => {
  let input;
  try {
    input = parseRegisterDeviceInput(request.data);
  } catch (err) {
    throw new HttpsError(
      'invalid-argument',
      err instanceof Error ? err.message : 'Invalid request body'
    );
  }

  const { registration, rejected, projections } = await buildDeviceRegistration(
    input,
    verifyOptions,
    logError
  );

  if (registration.characterIds.length === 0) {
    throw new HttpsError('unauthenticated', 'No character access token could be verified');
  }

  const db = getFirestore();
  await Promise.all([
    db.collection('deviceRegistrations').doc(input.deviceId).set({
      fcmToken: registration.fcmToken,
      characterIds: registration.characterIds,
      updatedAt: FieldValue.serverTimestamp(),
    }),
    ...projections.map((p) => replaceCharacterProjection(db, p.characterId, p.rows)),
  ]);

  return { deviceId: input.deviceId, registered: registration.characterIds, rejected };
});

/**
 * dispatchProjections: fires whatever is due (issue #358, ADR 0010,
 * CONTEXT.md round 45) — the only scheduled function in this codebase, so the
 * one Cloud Scheduler job this deployment needs. Runs every 5 minutes,
 * matching the Foreground Poller's own cadence (`POLL_INTERVAL_MS`).
 *
 * Holds no EVE token and makes no ESI call: every row already carries
 * rendered title/body text, uploaded by a device that read the real data
 * (ADR 0010). This function only decides *when* to fire what it was handed.
 */
export const dispatchProjections = onSchedule('every 5 minutes', async () => {
  const db = getFirestore();
  const messaging = getMessaging();
  const now = Date.now();

  // Mirrors dispatchProjections.ts's `isDue` (fireAt <= now) as a Firestore
  // query filter — a Firestore `where` can't call that function directly,
  // but the boundary must stay the same one `isDue`'s own tests pin.
  const dueSnapshot = await db
    .collection('projections')
    .where('fired', '==', false)
    .where('fireAt', '<=', now)
    .get();

  await Promise.all(
    dueSnapshot.docs.map(async (doc) => {
      const row = doc.data() as StoredProjectionRow;

      // Unfired and more than 7 days past fireAt: a device that stopped
      // checking in. A week-late "your skill finished" is worse than
      // silence (CONTEXT round 45) — delete unsent rather than send.
      if (isStaleUnsent(row, now)) {
        await doc.ref.delete();
        return;
      }

      const devicesSnapshot = await db
        .collection('deviceRegistrations')
        .where('characterIds', 'array-contains', row.characterId)
        .get();

      const data = buildPushData(row);
      const sent = await Promise.all(
        devicesSnapshot.docs.map(async (deviceDoc) => {
          try {
            await messaging.send({ token: deviceDoc.data().fcmToken as string, data });
            return true;
          } catch (err) {
            const code = err instanceof Error && 'code' in err ? String(err.code) : '';
            if (shouldDeleteDeviceToken(code)) {
              await deviceDoc.ref.delete();
            } else {
              logError('Scheduled Push: send failed', {
                deviceId: deviceDoc.id,
                error: code || (err instanceof Error ? err.message : String(err)),
              });
            }
            return false;
          }
        })
      );

      // Only mark fired once at least one device actually received it — a
      // row with no registered device, or every send failing on a transient
      // error, is left unfired so the next 5-minute tick retries it. The
      // 7-day stale-unsent check above is what eventually gives up, not this
      // one: a total, persistent failure self-resolves into a deletion
      // rather than a silently "delivered" row nobody got.
      if (sent.some(Boolean)) {
        await doc.ref.update({ fired: true, firedAt: now });
      }
    })
  );

  // Fired rows are kept as the backend's half of the Notification Feed, then
  // purged like every other Feed row (round 20/45) — mirrors `isPastRetention`
  // as a query filter, same reasoning as `isDue` above.
  const stalePurgeSnapshot = await db
    .collection('projections')
    .where('fired', '==', true)
    .where('firedAt', '<', now - FIRED_RETENTION_MS)
    .get();
  if (!stalePurgeSnapshot.empty) {
    const purgeBatch = db.batch();
    for (const doc of stalePurgeSnapshot.docs) purgeBatch.delete(doc.ref);
    await purgeBatch.commit();
  }
});
