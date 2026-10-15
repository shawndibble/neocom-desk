// mintFirebaseToken: exchange a verified EVE access token for a Firebase
// custom token. The EVE *refresh* token never reaches this backend (ADR 0001);
// the client sends only its short-lived access token, which is verified
// against EVE's published JWKS before any Firebase credential is minted.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { error as logError, info as logInfo, warn as logWarn } from 'firebase-functions/logger';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import {
  verifyEveAccessToken,
  verifyOptionsFromEnv,
  uidForCharacter,
  characterIdForUid,
  type EveTokenClaims,
} from './verifyEveToken.js';
import {
  AlertGrantError,
  deleteAlertGrant as deleteAlertGrantFor,
  parseSaveAlertGrantInput,
  refreshAtSso,
  revokeAtSso,
  saveAlertGrant as saveAlertGrantFor,
  type AlertGrantDeps,
} from './alertGrant.js';
import { parseAlertsKey } from './alertGrantCrypto.js';
import { firestoreAlertGrantStore, firestorePollerStore } from './alertGrantStore.js';
import { fetchNotifications as fetchEsiNotifications } from './esiNotifications.js';
import { pollEveNotifications as pollEveNotificationsRun } from './pollEveNotifications.js';
import { buildDeviceRegistration, parseRegisterDeviceInput } from './registerDevice.js';
import { dispatchDueProjections, writeDeviceRegistration } from './projectionStore.js';
import {
  FEED_PURGE_BATCH_SIZE,
  FEED_PURGE_MAX_PASSES,
  NOTIFICATION_FEED_COLLECTION,
  feedPurgeCutoff,
} from './purgeFeed.js';
import {
  LAST_SYNCED_FIELD,
  STALE_ACCOUNT_BATCH_SIZE,
  STALE_ACCOUNT_MAX_PASSES,
  decideAccountAction,
  lastSyncedAtOf,
} from './purgeStaleAccounts.js';
import {
  parseCommunityIdInput,
  parseCreateInput,
  parseJoinInput,
  parseJoinRequestDecisionInput,
  parseMailInviteInput,
  parsePreviewInput,
  parseRemoveMemberInput,
  parseRequireApprovalInput,
  parseTransferAdminInput,
} from './communities.js';
import {
  createCommunity,
  decideJoinRequest,
  deleteCommunity,
  joinCommunity,
  confirmMailInvite,
  leaveCommunity,
  previewCommunity,
  purgeCharacterCommunities,
  regenerateInvite,
  releaseMailInvite,
  removeMember,
  reserveMailInvite,
  revokeInvite,
  setRequireApproval,
  transferAdmin,
  type CallerCharacter,
} from './communitiesStore.js';
import { LP_CORP_STATION_SYSTEMS } from './data/lpCorpStationSystems.js';
import {
  LP_STORE_OFFERS_CHUNK_SIZE,
  LP_STORE_OFFERS_COLLECTION,
  LP_STORE_OFFERS_META_DOC,
  LP_STORE_REQUEST_GAP_MS,
  fetchLpStoreRows,
} from './lpOffersSnapshot.js';
import { fetchArchiveFingerprint, streamPublicContractsCsvs } from './publicContractsArchive.js';
import {
  createR2Put,
  publishContractOffersToR2,
  publishCourierContractsToR2,
  type CourierR2PublishState,
  type R2PublishState,
} from './r2Publisher.js';
import { measureContractTypeChanges, type ContractTypeHashes } from './contractTypeChanges.js';
import {
  INSURGENCY_URL,
  LAWLESS_SYSTEMS_DOC,
  SYSTEM_CONDITIONS_COLLECTION,
  parseLawlessSystemIds,
} from './lawlessSystems.js';
import {
  ADAM4EVE_MIN_REQUEST_GAP_MS,
  ADAM4EVE_TYPE_CHUNK_SIZE,
  BACKFILL_HUB,
  FUZZWORK_TYPE_CHUNK_SIZE,
  MARKET_HISTORY_COLLECTION,
  PRICED_TYPE_IDS,
  SNAPSHOT_HUBS,
  buildAdam4eveHistoryUrl,
  buildFuzzworkUrl,
  chunk,
  foldHubPriceCapture,
  isOutsideRetention,
  missingBackfillDates,
  parseAdam4eveHistoryResponse,
  parseFuzzworkAggregates,
  utcDateString,
  type MarketHistoryDoc,
  type SidePrices,
  type StoredHubDay,
  type StoredHubPrice,
} from './marketSnapshot.js';
import {
  accumulateRequestedPlex,
  chunkDocId,
  buildContractOfferIndex,
  chunkDocData,
  chunkRows,
  compactContractOfferRow,
  courierContractFrom,
  eligibleContractFrom,
  isOutstandingCourierContract,
  sortContractOfferRows,
  sortCourierContractRows,
  PUBLIC_CONTRACT_OFFERS_CHUNK_SIZE,
  PUBLIC_CONTRACT_OFFERS_COLLECTION,
  PUBLIC_CONTRACT_OFFERS_INDEX_COLLECTION,
  PUBLIC_CONTRACT_OFFERS_INDEX_DOC,
  PUBLIC_CONTRACT_OFFERS_META_DOC,
  PUBLIC_COURIER_CONTRACTS_CHUNK_SIZE,
  PUBLIC_COURIER_CONTRACTS_COLLECTION,
  PUBLIC_COURIER_CONTRACTS_META_DOC,
  type EligibleContract,
  type PublicContractOfferRow,
  type PublicCourierContractRow,
} from './publicContracts.js';
import { runWorkbenchSync } from './workbenchFits.js';
import { firestoreWorkbenchFitsStore } from './workbenchFitsStore.js';

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

  const { registration, rejected, projections, eveTypesByCharacter } =
    await buildDeviceRegistration(input, verifyOptions, logError);

  if (registration.characterIds.length === 0) {
    throw new HttpsError('unauthenticated', 'No character access token could be verified');
  }

  await writeDeviceRegistration(getFirestore(), {
    deviceId: input.deviceId,
    fcmToken: registration.fcmToken,
    characterIds: registration.characterIds,
    projections,
    eveTypesByCharacter,
  });

  // The types the server has seen for each Character (alertGrants, ADR 0020),
  // so the client can offer a toggle for them. Only `seenTypes` is read out.
  const { store } = alertGrantDeps();
  const seenTypes: Record<string, string[]> = {};
  await Promise.all(
    registration.characterIds.map(async (characterId) => {
      try {
        seenTypes[String(characterId)] = (await store.get(characterId))?.seenTypes ?? [];
      } catch (err) {
        // The registration already landed; a failed read only delays new toggles.
        logError('Device registration: seenTypes read failed', { characterId, error: String(err) });
      }
    })
  );

  return { deviceId: input.deviceId, registered: registration.characterIds, rejected, seenTypes };
});

// Alerts Grant custody (issue #3753, ADR 0020). `ALERTS_TOKEN_KEY` is a Firebase
// secret (base64, 32 bytes): `firebase functions:secrets:set ALERTS_TOKEN_KEY`.
// Nothing here logs or returns a token; firestore.rules denies `alertGrants`.
const ALERTS_TOKEN_KEY = defineSecret('ALERTS_TOKEN_KEY');

function alertGrantDeps(): AlertGrantDeps {
  return {
    store: firestoreAlertGrantStore(getFirestore()),
    key: () => parseAlertsKey(ALERTS_TOKEN_KEY.value()),
    verify: (accessToken) => verifyEveAccessToken(accessToken, verifyOptions),
    refresh: (clientId, refreshToken) => refreshAtSso(clientId, refreshToken),
    revoke: (clientId, refreshToken) => revokeAtSso(clientId, refreshToken),
    now: () => Date.now(),
    log: (message, data) => logWarn(message, data),
  };
}

function alertGrantHttpsError(err: unknown): never {
  if (err instanceof AlertGrantError) throw new HttpsError(err.code, err.message);
  // Opaque: the cause could sit next to key material, so log the name only.
  logError('Alerts Grant call failed', { error: err instanceof Error ? err.name : 'unknown' });
  throw new HttpsError('internal', 'Alerts Grant call failed');
}

// The device's full-scope session is not involved: the callable's proof is the
// notifications-only access token itself, verified like registerDevice does.
export const saveAlertGrant = onCall<unknown>(
  { maxInstances: 5, secrets: [ALERTS_TOKEN_KEY] },
  async (request) => {
    try {
      return await saveAlertGrantFor(alertGrantDeps(), parseSaveAlertGrantInput(request.data));
    } catch (err) {
      return alertGrantHttpsError(err);
    }
  }
);

// Deleting needs the Character's own signed-in session, so one Character
// cannot drop another's grant.
export const deleteAlertGrant = onCall<unknown>(
  { maxInstances: 5, secrets: [ALERTS_TOKEN_KEY] },
  async (request) => {
    const { uid } = callerOf(request);
    try {
      return await deleteAlertGrantFor(alertGrantDeps(), characterIdForUid(uid)!);
    } catch (err) {
      return alertGrantHttpsError(err);
    }
  }
);

/**
 * dispatchProjections: fires whatever is due (issue #358, ADR 0010,
 * GLOSSARY.md round 45). Runs every 5 minutes, matching the Foreground
 * Poller's own cadence (`POLL_INTERVAL_MS`). One of this deployment's two
 * Cloud Scheduler jobs — `purgeNotificationFeed` below is the other.
 *
 * Holds no EVE token and makes no ESI call: every row already carries
 * rendered title/body text, uploaded by a device that read the real data
 * (ADR 0010). This function only decides *when* to fire what it was handed,
 * and pushes each row only to the device that uploaded it (issue #2240) —
 * see projectionStore.ts.
 */
export const dispatchProjections = onSchedule('every 15 minutes', async () => {
  await dispatchDueProjections(getFirestore(), getMessaging(), Date.now(), logError);
});

/**
 * pollEveNotifications (issue #3756, ADR 0020): every 15 minutes, reads each
 * active Alerts Grant's `/notifications/` feed and pushes the types a
 * registered device enabled. The only function that holds an EVE token, and
 * only the notifications-only one. Deploy is manual:
 * `firebase deploy --only functions:pollEveNotifications`.
 */
export const pollEveNotifications = onSchedule(
  {
    schedule: 'every 15 minutes',
    secrets: [ALERTS_TOKEN_KEY],
    timeoutSeconds: 540,
    maxInstances: 1,
  },
  async () => {
    const messaging = getMessaging();
    const summary = await pollEveNotificationsRun({
      store: firestorePollerStore(getFirestore(), {
        key: () => parseAlertsKey(ALERTS_TOKEN_KEY.value()),
        refresh: (clientId, refreshToken) => refreshAtSso(clientId, refreshToken),
      }),
      fetchNotifications: (characterId, accessToken, etag) =>
        fetchEsiNotifications(characterId, accessToken, etag),
      send: async (token, message) => {
        await messaging.send({
          token,
          data: message.data,
          ...(message.collapseKey ? { webpush: { headers: { Topic: message.collapseKey } } } : {}),
        });
      },
      log: (message, data) => logWarn(message, data),
    });
    logInfo('pollEveNotifications finished', { ...summary });
  }
);

/**
 * purgeNotificationFeed: server-side expiry for the remote Notification Feed
 * (issue #595), on the same 30 days the client rule and the fired-projection
 * purge already use.
 *
 * #582 made `syncFeed` delete a remote row fired outside the window, which
 * bounds the collection for any account that still syncs. It cannot reach an
 * account whose devices were all uninstalled without the Characters being
 * removed: nothing signs in as that uid again, so nothing runs the rule. This
 * job does, and reaches pre-existing rows too — it is a *collection group*
 * query, so one pass covers every `characters/{uid}/notificationFeed` without
 * enumerating accounts.
 *
 * Daily rather than every 5 minutes: the retention is 30 days, so the tick
 * only has to be small against that. It needs the collection-group index on
 * `firedAt` in firestore.indexes.json — deploy indexes before this function,
 * or the query fails FAILED_PRECONDITION until the index finishes building.
 */
export const purgeNotificationFeed = onSchedule('every 24 hours', async () => {
  const db = getFirestore();
  // Mirrors purgeFeed.ts's `isPurgeableFeedRow` (and so dispatchProjections'
  // `isPastRetention`) as a query filter — a Firestore `where` can't call
  // either, but the boundary must stay the one their tests pin. One cutoff
  // for the whole run, so a long backlog can't shift the edge mid-pass.
  const cutoff = feedPurgeCutoff(Date.now());

  let deleted = 0;
  for (let pass = 0; pass < FEED_PURGE_MAX_PASSES; pass += 1) {
    const snapshot = await db
      .collectionGroup(NOTIFICATION_FEED_COLLECTION)
      .where('firedAt', '<', cutoff)
      .limit(FEED_PURGE_BATCH_SIZE)
      .get();
    if (snapshot.empty) return;

    const batch = db.batch();
    for (const doc of snapshot.docs) batch.delete(doc.ref);
    await batch.commit();
    deleted += snapshot.size;

    // A short page means the backlog is drained; anything else keeps going
    // until the pass bound, which is what stops one run spinning forever.
    if (snapshot.size < FEED_PURGE_BATCH_SIZE) return;
  }

  // Hit the ceiling: the remainder is simply left for tomorrow's tick rather
  // than dropped, but it is worth knowing the backlog is that large.
  logWarn('Notification Feed purge: pass limit reached, backlog continues next run', {
    cutoff,
    deleted,
  });
});

/**
 * purgeStaleAccounts: deletes the synced data of accounts with no successful
 * sync in 90 days (issue #2065). Retention is by inactivity, not by Character
 * removal, so it reaches accounts whose devices are all gone.
 *
 * Enumerates `characters/{uid}` with `listDocuments()` (which includes uids
 * that only have subcollections and no parent doc), then per uid: seeds the
 * heartbeat if absent, or, when stale, empties every subcollection in bounded
 * batches and finally deletes the parent doc. The run-wide pass cap leaves a
 * large backlog for the next tick; the parent doc survives until its
 * subcollections are empty, so a half-purged account stays stale.
 */
export const purgeStaleAccounts = onSchedule(
  { schedule: 'every 24 hours', secrets: [ALERTS_TOKEN_KEY] },
  async () => {
    const db = getFirestore();
    const now = Date.now();
    let passes = 0;
    let purged = 0;

    for (const ref of await db.collection('characters').listDocuments()) {
      const snap = await ref.get();
      const action = decideAccountAction(lastSyncedAtOf(snap.data()), now);
      if (action === 'keep') continue;
      if (action === 'seed') {
        await ref.set({ [LAST_SYNCED_FIELD]: now }, { merge: true });
        continue;
      }

      // Shared Community data lives outside `characters/{uid}`, so the
      // subcollection sweep below would never reach it (ADR 0018).
      try {
        await purgeCharacterCommunities(db, ref.id);
      } catch (err) {
        // Leave the account (and its stale heartbeat) in place so tomorrow's
        // run retries it, rather than letting one bad Community abort the rest.
        logWarn('Stale account purge: Community cleanup failed, will retry', {
          uid: ref.id,
          error: err instanceof Error ? err.message : err,
        });
        continue;
      }

      // The server-held Alerts Grant token goes with the account (ADR 0020).
      try {
        const characterId = characterIdForUid(ref.id);
        if (characterId !== undefined) await deleteAlertGrantFor(alertGrantDeps(), characterId);
      } catch (err) {
        logWarn('Stale account purge: Alerts Grant cleanup failed, will retry', {
          uid: ref.id,
          error: err instanceof Error ? err.name : 'unknown',
        });
        continue;
      }

      for (const sub of await ref.listCollections()) {
        for (;;) {
          if (passes >= STALE_ACCOUNT_MAX_PASSES) {
            logWarn('Stale account purge: pass limit reached, backlog continues next run', {
              purged,
            });
            return;
          }
          const page = await sub.limit(STALE_ACCOUNT_BATCH_SIZE).get();
          if (page.empty) break;
          passes += 1;
          const batch = db.batch();
          for (const doc of page.docs) batch.delete(doc.ref);
          await batch.commit();
        }
      }
      await ref.delete();
      purged += 1;
    }
  }
);

// Communities (issue #3596, ADR 0018). Every write that enforces a cap or
// deletes another doc goes through these callables (communitiesStore.ts); the
// client only writes a Member's own library chunks, directly, under the rules.

/** The signed-in Character behind a callable: uid `char:{id}` + ownerHash claim. */
function callerOf(request: {
  auth?: { uid: string; token: Record<string, unknown> };
}): CallerCharacter {
  const uid = request.auth?.uid;
  const ownerHash = request.auth?.token.ownerHash;
  if (!uid || !uid.startsWith('char:') || typeof ownerHash !== 'string') {
    throw new HttpsError('unauthenticated', 'Sign in with a Character first');
  }
  return { uid, ownerHash };
}

const COMMUNITY_CALLABLE_OPTIONS = { maxInstances: 5 };

export const createCommunityCallable = onCall<unknown>(COMMUNITY_CALLABLE_OPTIONS, (request) =>
  createCommunity(getFirestore(), callerOf(request), parseCreateInput(request.data))
);

// Callable with no session on purpose: the invite page shows what the link is
// for before a visitor signs in. Returns three public facts, see previewCommunity.
export const previewCommunityCallable = onCall<unknown>(COMMUNITY_CALLABLE_OPTIONS, (request) =>
  previewCommunity(getFirestore(), parsePreviewInput(request.data).inviteCode)
);

export const joinCommunityCallable = onCall<unknown>(COMMUNITY_CALLABLE_OPTIONS, (request) =>
  joinCommunity(getFirestore(), callerOf(request), parseJoinInput(request.data))
);

export const setCommunityApprovalCallable = onCall<unknown>(
  COMMUNITY_CALLABLE_OPTIONS,
  async (request) => {
    const { communityId, requireApproval } = parseRequireApprovalInput(request.data);
    await setRequireApproval(getFirestore(), callerOf(request), communityId, requireApproval);
  }
);

export const decideCommunityJoinRequestCallable = onCall<unknown>(
  COMMUNITY_CALLABLE_OPTIONS,
  async (request) => {
    const { communityId, memberUid, accept } = parseJoinRequestDecisionInput(request.data);
    await decideJoinRequest(getFirestore(), callerOf(request), communityId, memberUid, accept);
  }
);

export const leaveCommunityCallable = onCall<unknown>(
  COMMUNITY_CALLABLE_OPTIONS,
  async (request) => {
    await leaveCommunity(
      getFirestore(),
      callerOf(request),
      parseCommunityIdInput(request.data).communityId
    );
  }
);

export const removeCommunityMemberCallable = onCall<unknown>(
  COMMUNITY_CALLABLE_OPTIONS,
  async (request) => {
    const { communityId, memberUid } = parseRemoveMemberInput(request.data);
    await removeMember(getFirestore(), callerOf(request), communityId, memberUid);
  }
);

export const transferCommunityAdminCallable = onCall<unknown>(
  COMMUNITY_CALLABLE_OPTIONS,
  async (request) => {
    const { communityId, memberUid } = parseTransferAdminInput(request.data);
    await transferAdmin(getFirestore(), callerOf(request), communityId, memberUid);
  }
);

// Mail invites (issue #3604): the client sends the EVE mail with its own token,
// so the cap, the one-per-target rule and the "Sent" stamp live in these three.
export const reserveCommunityMailInviteCallable = onCall<unknown>(
  COMMUNITY_CALLABLE_OPTIONS,
  (request) => {
    const { communityId, targetCharacterId, targetName } = parseMailInviteInput(request.data);
    return reserveMailInvite(
      getFirestore(),
      callerOf(request),
      communityId,
      targetCharacterId,
      targetName
    );
  }
);

export const confirmCommunityMailInviteCallable = onCall<unknown>(
  COMMUNITY_CALLABLE_OPTIONS,
  async (request) => {
    const { communityId, targetCharacterId } = parseMailInviteInput(request.data);
    await confirmMailInvite(getFirestore(), callerOf(request), communityId, targetCharacterId);
  }
);

export const releaseCommunityMailInviteCallable = onCall<unknown>(
  COMMUNITY_CALLABLE_OPTIONS,
  async (request) => {
    const { communityId, targetCharacterId } = parseMailInviteInput(request.data);
    await releaseMailInvite(getFirestore(), callerOf(request), communityId, targetCharacterId);
  }
);

export const revokeCommunityInviteCallable = onCall<unknown>(
  COMMUNITY_CALLABLE_OPTIONS,
  async (request) => {
    await revokeInvite(
      getFirestore(),
      callerOf(request),
      parseCommunityIdInput(request.data).communityId
    );
  }
);

export const regenerateCommunityInviteCallable = onCall<unknown>(
  COMMUNITY_CALLABLE_OPTIONS,
  (request) =>
    regenerateInvite(
      getFirestore(),
      callerOf(request),
      parseCommunityIdInput(request.data).communityId
    )
);

export const deleteCommunityCallable = onCall<unknown>(
  COMMUNITY_CALLABLE_OPTIONS,
  async (request) => {
    await deleteCommunity(
      getFirestore(),
      callerOf(request),
      parseCommunityIdInput(request.data).communityId
    );
  }
);

/** Firestore's hard cap on writes in a single `WriteBatch`, with headroom for a shorter final page. */
const BATCH_WRITE_PAGE_SIZE = 450;

/**
 * Applies more write operations than fit in one `WriteBatch` by paging them
 * across several.
 *
 * `pageSize` exists because the op *count* is not always the binding limit.
 * `commit()` is where the Admin SDK encodes each document — `batch.set()` only
 * stores it — so a page of documents that are individually large costs a
 * transient proportional to the whole page. The public-contract snapshot's
 * ~600KB chunk docs need a much smaller page than the default; small per-doc
 * writers can keep filling batches to Firestore's own limit.
 */
async function commitInPages(
  db: Firestore,
  ops: readonly ((batch: FirebaseFirestore.WriteBatch) => void)[],
  pageSize: number = BATCH_WRITE_PAGE_SIZE
): Promise<void> {
  for (let i = 0; i < ops.length; i += pageSize) {
    const batch = db.batch();
    for (const op of ops.slice(i, i + pageSize)) op(batch);
    await batch.commit();
  }
}

/**
 * Chunk docs per `WriteBatch`. Deliberately far below Firestore's 500-op cap:
 * committing every chunk of a snapshot in one batch encodes the whole thing
 * at once, which is what exhausted the 512MiB container even after the parse
 * itself had been made cheap. Five chunks of 3,000 rows keep that transient
 * near 3MB. The total write count is unchanged — this only affects how many
 * are in flight together.
 *
 * Shared by both public-contract snapshots: what a page of chunk docs costs to
 * encode is not what an offers chunk and a courier chunk differ in.
 */
const PUBLIC_CONTRACT_CHUNK_DOCS_PER_BATCH = 5;

/** Where one chunked snapshot lives, and how coarsely it is written. */
interface ChunkedSnapshot {
  collection: string;
  metaDoc: string;
  chunkSize: number;
  chunkDocsPerBatch: number;
}

/**
 * Replaces a chunked snapshot wholesale: chunk docs 0..N-1 are overwritten,
 * any leftover chunk from a previously-larger run is deleted (`meta`'s stored
 * `chunkCount` is how a shrinking dataset's stale chunks are found — nothing
 * else records how many there used to be), and `meta` itself is updated last
 * so a reader never sees a `chunkCount` ahead of what's actually been written
 * this run.
 *
 * Written against a `ChunkedSnapshot` rather than against this one
 * collection: it was shared with the blueprint-only sync until #907 retired
 * that, and how a snapshot is replaced is not what two such syncs differ in.
 */
async function writeChunkedSnapshot<Row>(
  db: Firestore,
  snapshot: ChunkedSnapshot,
  rows: readonly Row[]
): Promise<number> {
  const collection = db.collection(snapshot.collection);
  const metaRef = collection.doc(snapshot.metaDoc);
  const previousChunkCount = ((await metaRef.get()).data()?.chunkCount as number | undefined) ?? 0;

  // Fixed before the first write and stamped on every chunk, then reused as
  // `meta.lastSyncedAt` and the index's: a reader that finds a chunk from a
  // different publish than the `meta` it began with knows it read across one.
  const publishedAt = Date.now();
  const chunks = chunkRows(rows, snapshot.chunkSize);
  const ops: ((batch: FirebaseFirestore.WriteBatch) => void)[] = chunks.map((chunk, index) => {
    const ref = collection.doc(chunkDocId(index));
    return (batch) => batch.set(ref, chunkDocData(chunk, publishedAt));
  });
  for (let i = chunks.length; i < previousChunkCount; i += 1) {
    const ref = collection.doc(chunkDocId(i));
    ops.push((batch) => batch.delete(ref));
  }
  await commitInPages(db, ops, snapshot.chunkDocsPerBatch);

  await metaRef.set({
    lastSyncedAt: publishedAt,
    chunkCount: chunks.length,
    rowCount: rows.length,
  });
  return publishedAt;
}

const LP_STORE_OFFERS_SNAPSHOT: ChunkedSnapshot = {
  collection: LP_STORE_OFFERS_COLLECTION,
  metaDoc: LP_STORE_OFFERS_META_DOC,
  chunkSize: LP_STORE_OFFERS_CHUNK_SIZE,
  chunkDocsPerBatch: PUBLIC_CONTRACT_CHUNK_DOCS_PER_BATCH,
};

const PUBLIC_CONTRACT_OFFERS_SNAPSHOT: ChunkedSnapshot = {
  collection: PUBLIC_CONTRACT_OFFERS_COLLECTION,
  metaDoc: PUBLIC_CONTRACT_OFFERS_META_DOC,
  chunkSize: PUBLIC_CONTRACT_OFFERS_CHUNK_SIZE,
  chunkDocsPerBatch: PUBLIC_CONTRACT_CHUNK_DOCS_PER_BATCH,
};

/**
 * The courier half of the same crawl (issue #909). Its own collection because
 * a courier row shares none of an offer row's fields beyond identity — see
 * `PublicCourierContractRow` — and `writeChunkedSnapshot` replaces one
 * snapshot from one row array, so two shapes in one collection is not a thing
 * this writer can express in the first place.
 */
const PUBLIC_COURIER_CONTRACTS_SNAPSHOT: ChunkedSnapshot = {
  collection: PUBLIC_COURIER_CONTRACTS_COLLECTION,
  metaDoc: PUBLIC_COURIER_CONTRACTS_META_DOC,
  chunkSize: PUBLIC_COURIER_CONTRACTS_CHUNK_SIZE,
  chunkDocsPerBatch: PUBLIC_CONTRACT_CHUNK_DOCS_PER_BATCH,
};

async function writePublicContractOffersSnapshot(
  db: Firestore,
  rows: readonly PublicContractOfferRow[]
): Promise<number> {
  const lastSyncedAt = await writeChunkedSnapshot(db, PUBLIC_CONTRACT_OFFERS_SNAPSHOT, rows);
  // The index is an optimisation a client can do without (it falls back to
  // reading every chunk), so a failure to write it is logged, never allowed to
  // fail a run whose chunks and meta are already published (issue #2921).
  try {
    await db
      .collection(PUBLIC_CONTRACT_OFFERS_INDEX_COLLECTION)
      .doc(PUBLIC_CONTRACT_OFFERS_INDEX_DOC)
      .set({
        lastSyncedAt,
        ...buildContractOfferIndex(rows, PUBLIC_CONTRACT_OFFERS_CHUNK_SIZE),
      });
  } catch (error) {
    logError('public contract offers index write failed', { error: String(error) });
  }
  return lastSyncedAt;
}

async function writePublicCourierContractsSnapshot(
  db: Firestore,
  rows: readonly PublicCourierContractRow[]
): Promise<void> {
  await writeChunkedSnapshot(db, PUBLIC_COURIER_CONTRACTS_SNAPSHOT, rows);
}

/**
 * syncPublicContractOffers: the public contract search's data source
 * (issues #608, #906, ADR 0013). Pulls EVE Ref's public-contracts snapshot
 * (no CORS, so the client can't fetch it directly) and republishes every
 * for-sale line of every public item_exchange/auction contract, any item
 * type, to `publicContractOffers` for signed-in clients to search.
 *
 * Every 30 minutes, matching EVE Ref's own twice-hourly refresh cadence.
 *
 * The archive is streamed rather than buffered: `contracts.csv` is read into
 * a lookup of only the fields the join needs, then `contract_items.csv` is
 * joined against it row by row. Holding the two CSVs as text and parsing them
 * whole needed ~1.1GB of heap for 37MB of input; the streaming pass peaks far
 * below that against the same live data.
 *
 * It publishes a second snapshot off the same pass: `publicCourierContracts`,
 * every outstanding public courier contract as a route and a fee (issue #909).
 * Courier contracts have no item lines to join, so they cost one more
 * accumulator and ~2 more writes per run — deliberately not a second scheduled
 * function or a second archive fetch, which is the shape #907 spent a ticket
 * undoing.
 *
 * This is the only public-contract sync. #906 added it beside a
 * blueprint-copies-only one as the expand half of an expand/contract, and
 * #907 retired that one once BPC Sourcing learned to take its blueprint slice
 * out of this snapshot client-side — so the archive is fetched once per cycle
 * again rather than twice.
 *
 * Memory is 2GiB against the retired blueprint-only sync's 1GiB, and the
 * timeout 540s against its 300s. Neither is measured at this volume; both are provisioned for
 * ~3x the rows on the evidence that exists. That evidence is specific: a
 * 512MiB ceiling died at 527MiB *during the write* with ~122k rows, having
 * survived the streaming parse — so the ceiling scales with the retained rows
 * and their encoding, which is exactly what triples here. Under-provisioning
 * reproduces a failure this project has already had (every scheduled run
 * OOM-looping silently after deploy); over-provisioning costs pennies on a
 * 48-runs/day cron. The `rowCount` logged below is the checkpoint: the first
 * live runs say what the real volume is, and these numbers can come down.
 *
 * 540s is the gen2 ceiling, not a chosen value, so there is no knob left if
 * the ~3x estimate is badly low: a run that can't finish inside it needs the
 * write restructured (incremental chunk commits, or the join split by region)
 * rather than a config bump. `rowCount` is the early warning for that too.
 *
 * It is the third of the deployment's Cloud Scheduler jobs, alongside
 * `dispatchProjections` and `purgeNotificationFeed` — back inside the 3 free
 * per billing account ADR 0013 budgeted against, now that the blueprint-only
 * sync it briefly ran beside is gone.
 */
// Same contact string ESI calls send (src/esi/client.ts's USER_AGENT) —
// functions/ has no `@/` alias to import it, and Adam4EVE's own docs ask for
// a User-Agent naming this app rather than a personal contact.
const MARKET_HISTORY_USER_AGENT = 'Neocom Desk (github.com/shawndibble/neocom-desk)';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchAdam4eveChunk(
  typeIds: readonly number[],
  start: string,
  end: string
): Promise<Map<number, Map<string, SidePrices>>> {
  const url = buildAdam4eveHistoryUrl(typeIds, BACKFILL_HUB.regionId, start, end);
  const response = await fetch(url, { headers: { 'User-Agent': MARKET_HISTORY_USER_AGENT } });
  if (!response.ok) {
    throw new Error(`Adam4EVE market_price_history request failed with status ${response.status}`);
  }
  return parseAdam4eveHistoryResponse(await response.json());
}

/**
 * Fills whatever days in the retention window have no doc at all yet, from
 * Adam4EVE's region-wide history (marketSnapshot.ts's header comment). A
 * no-op once the live capture below has covered every day in the window —
 * this is meant to run itself out of work within
 * `MARKET_HISTORY_RETENTION_DAYS` of first deploying.
 *
 * One request per 20-type chunk of the mining catalog, each covering the
 * whole missing date range in one call (Adam4EVE's `start`/`end` already
 * spans many days), spaced `ADAM4EVE_MIN_REQUEST_GAP_MS` apart — the
 * catalog is ~500 types, so ~25-30 requests, once.
 *
 * A chunk's request failing is logged and skipped rather than thrown
 * (issue #1279 follow-up: live, this 400'd with "Parameter 'typeID'
 * invalid!" for two of ~500 type_ids — 92371, 92374 — that Adam4EVE's own
 * catalog doesn't recognize, likely too new or too obscure for it to have
 * indexed). Those ~20 types simply keep falling to the `average` tier for
 * their missing days, same as before this job existed; the other ~480
 * types' backfill isn't held hostage by the ones Adam4EVE can't answer for.
 */
async function backfillFromAdam4eve(db: Firestore, missingDates: readonly string[]): Promise<void> {
  if (missingDates.length === 0) return;
  const missingDateSet = new Set(missingDates);
  const start = missingDates[0];
  const end = missingDates[missingDates.length - 1];

  const byDate = new Map<string, StoredHubDay>();
  const typeChunks = chunk(PRICED_TYPE_IDS, ADAM4EVE_TYPE_CHUNK_SIZE);
  const stationKey = String(BACKFILL_HUB.stationId);
  let skippedChunks = 0;
  for (let i = 0; i < typeChunks.length; i += 1) {
    if (i > 0) await sleep(ADAM4EVE_MIN_REQUEST_GAP_MS);
    let byTypeThenDate: Map<number, Map<string, SidePrices>>;
    try {
      byTypeThenDate = await fetchAdam4eveChunk(typeChunks[i], start, end);
    } catch (err) {
      skippedChunks += 1;
      logWarn('Adam4EVE backfill chunk failed, skipping', {
        typeIds: typeChunks[i],
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }
    for (const [typeId, byDateForType] of byTypeThenDate) {
      for (const [date, prices] of byDateForType) {
        // Adam4EVE's own range can include a day this run already captured
        // live (e.g. a retry landing after midnight UTC) — only the actual
        // gaps get written from this source.
        if (!missingDateSet.has(date)) continue;
        const day = byDate.get(date) ?? {};
        const stationBucket = day[stationKey] ?? {};
        stationBucket[String(typeId)] = {
          buy: prices.buy,
          sell: prices.sell,
          buyCount: prices.buy === null ? 0 : 1,
          sellCount: prices.sell === null ? 0 : 1,
        };
        day[stationKey] = stationBucket;
        byDate.set(date, day);
      }
    }
  }

  const updatedAt = Date.now();
  await Promise.all(
    [...byDate].map(([date, hubs]) => {
      const doc: MarketHistoryDoc = { hubs, source: 'adam4eve', updatedAt };
      return db.collection(MARKET_HISTORY_COLLECTION).doc(date).set(doc);
    })
  );
  logInfo('market history backfill', {
    requestedDays: missingDates.length,
    daysWritten: byDate.size,
    skippedChunks,
  });
}

/**
 * Captures every hub's current live book and folds it into today's running
 * average (marketSnapshot.ts's `foldHubPriceCapture`). Runs every 6 hours;
 * a fetch failure for one hub is logged and skipped rather than failing the
 * whole run — the day's average is simply built from however many captures
 * actually landed.
 */
async function captureLiveHubPrices(db: Firestore, today: string): Promise<void> {
  const docRef = db.collection(MARKET_HISTORY_COLLECTION).doc(today);
  const existing = (await docRef.get()).data() as MarketHistoryDoc | undefined;
  const hubs: StoredHubDay = existing?.source === 'fuzzwork' ? { ...existing.hubs } : {};

  for (const hub of SNAPSHOT_HUBS) {
    const captured = new Map<number, SidePrices>();
    for (const typeIdChunk of chunk(PRICED_TYPE_IDS, FUZZWORK_TYPE_CHUNK_SIZE)) {
      const url = buildFuzzworkUrl(hub.stationId, typeIdChunk);
      let response: Response;
      try {
        response = await fetch(url);
      } catch (err) {
        logWarn('Fuzzwork aggregates request failed', {
          hub: hub.id,
          error: err instanceof Error ? err.message : String(err),
        });
        continue;
      }
      if (!response.ok) {
        logWarn('Fuzzwork aggregates request failed', { hub: hub.id, status: response.status });
        continue;
      }
      for (const [typeId, prices] of parseFuzzworkAggregates(await response.json(), typeIdChunk)) {
        captured.set(typeId, prices);
      }
    }

    const stationKey = String(hub.stationId);
    const stationBucket: Record<string, StoredHubPrice> = { ...hubs[stationKey] };
    for (const [typeId, prices] of captured) {
      stationBucket[String(typeId)] = foldHubPriceCapture(stationBucket[String(typeId)], prices);
    }
    hubs[stationKey] = stationBucket;
  }

  const doc: MarketHistoryDoc = { hubs, source: 'fuzzwork', updatedAt: Date.now() };
  await docRef.set(doc);
  logInfo('market history live capture', { date: today, hubCount: SNAPSHOT_HUBS.length });
}

/**
 * captureMiningPriceSnapshot: the Mining Yield Overview's server-side price
 * source (issue #1279) — see marketSnapshot.ts's header comment for the full
 * design. Every 6 hours: backfill whatever's missing from Adam4EVE (idle
 * once the window is full), fold a live capture into today's running
 * average, then prune anything that's aged out of the retention window.
 *
 * One collection read up front serves both the backfill-gap check and the
 * prune list, rather than two passes over the same ~90-100 docs.
 *
 * Backfill runs first but is wrapped so it can never block the other two
 * steps: it is a one-time fill of history the app already had a fallback
 * for (ESI's `average`), while live capture is the thing that has to run
 * every single tick to keep today's price building up. A prior deploy hit
 * exactly this — one bad Adam4EVE chunk threw, which killed the whole
 * invocation before live capture or the prune ever ran (see
 * `backfillFromAdam4eve`'s own per-chunk tolerance for the underlying fix;
 * this is the second, outer layer, in case something *else* in that
 * function throws next time).
 *
 * It is the deployment's 4th scheduled job, alongside `dispatchProjections`,
 * `purgeNotificationFeed` and `syncPublicContractOffers` — past the 3 free
 * Cloud Scheduler jobs per billing account `syncPublicContractOffers`'s own
 * comment budgeted against (see the decision doc this ships with).
 */
export const captureMiningPriceSnapshot = onSchedule(
  { schedule: 'every 6 hours', timeoutSeconds: 540 },
  async () => {
    const db = getFirestore();
    const today = utcDateString(new Date());

    const snapshot = await db.collection(MARKET_HISTORY_COLLECTION).get();
    const existingDates = new Set(snapshot.docs.map((doc) => doc.id));
    const staleDocs = snapshot.docs.filter((doc) => isOutsideRetention(doc.id, today));

    try {
      await backfillFromAdam4eve(db, missingBackfillDates(existingDates, today));
    } catch (err) {
      logError('market history backfill failed, continuing to live capture', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    await captureLiveHubPrices(db, today);

    if (staleDocs.length > 0) {
      const batch = db.batch();
      for (const doc of staleDocs) batch.delete(doc.ref);
      await batch.commit();
      logInfo('market history prune', { deleted: staleDocs.length });
    }
  }
);

/**
 * syncLawlessSystems (issue #2870): Route Safety's "lawless" badge. CCP's
 * insurgency feed is CORS-locked to eveonline.com, so this fetches it every
 * 10 minutes (its own cache window) and stores the lawless system ids for the
 * app to read. A failed fetch writes nothing: the doc just ages, and the app
 * hides the badge once `updatedAt` passes its staleness limit.
 *
 * Another Cloud Scheduler job past the free three, like the jobs above.
 */
export const syncLawlessSystems = onSchedule({ schedule: 'every 10 minutes' }, async () => {
  const response = await fetch(INSURGENCY_URL, {
    headers: {
      'User-Agent': MARKET_HISTORY_USER_AGENT,
      'X-User-Agent': MARKET_HISTORY_USER_AGENT,
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    logWarn('lawless systems fetch failed', { status: response.status });
    return;
  }
  const body: unknown = await response.json().catch(() => null);
  // A changed or broken body is not "nothing lawless": write nothing, let the doc age.
  if (!Array.isArray(body)) {
    logWarn('lawless systems body was not a list');
    return;
  }
  const systemIds = parseLawlessSystemIds(body);
  await getFirestore()
    .collection(SYSTEM_CONDITIONS_COLLECTION)
    .doc(LAWLESS_SYSTEMS_DOC)
    .set({ systemIds, updatedAt: Date.now() });
  logInfo('lawless systems sync', { count: systemIds.length });
});

/** Doc under `systemConditions` holding the archive version the last publish was built from. */
const PUBLIC_CONTRACTS_ARCHIVE_FINGERPRINT_DOC = 'publicContractsArchiveFingerprint';

/** Doc under `systemConditions` holding the last publish's per-type content hashes (issue #3744). */
const PUBLIC_CONTRACTS_TYPE_HASHES_DOC = 'publicContractTypeHashes';

/** Doc under `systemConditions` holding what the R2 writer last published (issue #3745). */
const PUBLIC_CONTRACTS_R2_STATE_DOC = 'publicContractR2State';

/** Doc under `systemConditions` holding what the R2 courier writer last published (issue #3748). */
const PUBLIC_COURIERS_R2_STATE_DOC = 'publicCourierR2State';

const R2_ACCESS_KEY_ID = defineSecret('R2_ACCESS_KEY_ID');
const R2_SECRET_ACCESS_KEY = defineSecret('R2_SECRET_ACCESS_KEY');

/**
 * Additive to the Firestore snapshot (ADR 0019): never throws, so an R2 outage
 * cannot fail the Firestore publish.
 */
async function publishOffersToR2(
  db: Firestore,
  rows: readonly PublicContractOfferRow[],
  lastSyncedAt: number
): Promise<void> {
  try {
    const endpoint = process.env.R2_ENDPOINT;
    const bucket = process.env.R2_BUCKET;
    if (!endpoint?.startsWith('https://') || !bucket) {
      logWarn('R2 offers publish skipped: R2_ENDPOINT (https) / R2_BUCKET not set');
      return;
    }
    const stateRef = db.collection(SYSTEM_CONDITIONS_COLLECTION).doc(PUBLIC_CONTRACTS_R2_STATE_DOC);
    const previous = await stateRef
      .get()
      .then((snap) => (snap.exists ? (snap.data() as R2PublishState) : null))
      .catch(() => null);
    const result = await publishContractOffersToR2({
      rows,
      lastSyncedAt,
      previous,
      now: Date.now(),
      put: createR2Put({
        endpoint,
        bucket,
        accessKeyId: R2_ACCESS_KEY_ID.value(),
        secretAccessKey: R2_SECRET_ACCESS_KEY.value(),
      }),
      onProgress: async (state) => {
        await stateRef.set(state);
      },
    });
    await stateRef.set(result.state);
    const { uploaded, skipped, failed, remaining, indexWritten, firstError } = result;
    (result.failed > 0 || !result.indexWritten ? logWarn : logInfo)(
      'public contract offers R2 publish',
      { uploaded, skipped, failed, remaining, indexWritten, firstError }
    );
  } catch (error) {
    logError('public contract offers R2 publish failed', { error: String(error) });
  }
}

/** Same contract as `publishOffersToR2`, for the courier snapshot (issue #3748): never throws. */
async function publishCourierToR2(
  db: Firestore,
  rows: readonly PublicCourierContractRow[],
  lastSyncedAt: number
): Promise<void> {
  try {
    const endpoint = process.env.R2_ENDPOINT;
    const bucket = process.env.R2_BUCKET;
    if (!endpoint?.startsWith('https://') || !bucket) {
      logWarn('R2 courier publish skipped: R2_ENDPOINT (https) / R2_BUCKET not set');
      return;
    }
    const stateRef = db.collection(SYSTEM_CONDITIONS_COLLECTION).doc(PUBLIC_COURIERS_R2_STATE_DOC);
    const previous = await stateRef
      .get()
      .then((snap) => (snap.exists ? (snap.data() as CourierR2PublishState) : null))
      .catch(() => null);
    const result = await publishCourierContractsToR2({
      rows,
      lastSyncedAt,
      previous,
      now: Date.now(),
      put: createR2Put({
        endpoint,
        bucket,
        accessKeyId: R2_ACCESS_KEY_ID.value(),
        secretAccessKey: R2_SECRET_ACCESS_KEY.value(),
      }),
    });
    await stateRef.set(result.state);
    const { uploaded, indexWritten, firstError } = result;
    (indexWritten ? logInfo : logWarn)('public courier contracts R2 publish', {
      uploaded,
      indexWritten,
      firstError,
    });
  } catch (error) {
    logError('public courier contracts R2 publish failed', { error: String(error) });
  }
}

export const syncPublicContractOffers = onSchedule(
  {
    schedule: 'every 30 minutes',
    memory: '2GiB',
    timeoutSeconds: 540,
    secrets: [R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY],
  },
  async () => {
    // Skip the whole run when EVE Ref has not published a new archive since
    // the last publish. The fingerprint is read before the download and stored
    // only after the write, so a refresh landing in between is picked up next
    // run rather than lost. An unreadable fingerprint always syncs.
    const db = getFirestore();
    const fingerprintRef = db
      .collection(SYSTEM_CONDITIONS_COLLECTION)
      .doc(PUBLIC_CONTRACTS_ARCHIVE_FINGERPRINT_DOC);
    const fingerprint = await fetchArchiveFingerprint();
    if (fingerprint !== null) {
      // A failed read just means "cannot tell": sync rather than fail the run.
      const stored = await fingerprintRef
        .get()
        .then((snap) => snap.data()?.fingerprint as unknown)
        .catch(() => null);
      if (stored === fingerprint) {
        logInfo('public contract offers sync skipped: archive unchanged', { fingerprint });
        return;
      }
    }
    const nowMs = Date.now();
    const eligibleContracts = new Map<string, EligibleContract>();
    const rows: PublicContractOfferRow[] = [];
    const courierRows: PublicCourierContractRow[] = [];
    // Keyed the same as `eligibleContracts` (raw CSV `contract_id`), and just
    // as small — a running total per PLEX-requesting contract, not a second
    // copy of `contract_items.csv`. `contract_items.csv` is a single stream
    // (see publicContractsArchive.ts), so a requested-PLEX line can arrive
    // before or after the same contract's offered line; folding every line
    // into this map as it passes and patching `rows` once the stream ends
    // (below) gets `requestedPlexByContract`'s answer without a second pass
    // or buffering the line-by-line records.
    const requestedPlexTotals = new Map<string, number>();
    let outstandingCourierContracts = 0;

    await streamPublicContractsCsvs({
      onContract: (record) => {
        const eligible = eligibleContractFrom(record, nowMs);
        if (eligible) {
          eligibleContracts.set(record.contract_id, eligible);
          return;
        }
        if (isOutstandingCourierContract(record, nowMs)) outstandingCourierContracts += 1;
        const courier = courierContractFrom(record, nowMs);
        if (courier) courierRows.push(courier);
      },
      onItem: (record) => {
        accumulateRequestedPlex(record, eligibleContracts, requestedPlexTotals);
        const contract = eligibleContracts.get(record.contract_id);
        if (!contract) return;
        const row = compactContractOfferRow(record, contract);
        if (row) rows.push(row);
      },
    });

    if (requestedPlexTotals.size > 0) {
      for (const row of rows) {
        const requestedPlex = requestedPlexTotals.get(String(row.contractId));
        if (requestedPlex) row.requestedPlex = requestedPlex;
      }
    }

    // `outstandingCourierContracts` against `courierRowCount` is the only
    // thing that tells an empty courier snapshot apart from one whose rows were
    // all dropped for a blank endpoint, reward or volume — the same reason
    // publicContractsArchive.ts throws on a reordered archive rather than
    // publishing silence. The two counts share a gate
    // (`isOutstandingCourierContract`), so expiry and contract type are already
    // excluded from both and cannot open a gap: any gap at all is EVE Ref
    // leaving a column blank that `courierContractFrom` requires.
    logInfo('public contract offers sync', {
      eligibleContracts: eligibleContracts.size,
      rowCount: rows.length,
      outstandingCourierContracts,
      courierRowCount: courierRows.length,
    });

    // The lookup is dead once the join is done, and it is ~50k objects the
    // write would otherwise be encoding rows alongside.
    eligibleContracts.clear();
    // Sizes the R2 per-type writer (ADR 0019): how many types change per
    // publish. Telemetry only — a failure here must not fail the publish.
    const typeHashesRef = db
      .collection(SYSTEM_CONDITIONS_COLLECTION)
      .doc(PUBLIC_CONTRACTS_TYPE_HASHES_DOC);
    let typeHashes: ContractTypeHashes | null = null;
    try {
      const previousHashes = await typeHashesRef
        .get()
        .then((snap) => (snap.data()?.hashes as ContractTypeHashes | undefined) ?? null)
        .catch(() => null);
      const measured = measureContractTypeChanges(rows, previousHashes);
      typeHashes = measured.hashes;
      logInfo('public contract type changes', {
        ...measured.stats,
        firstRun: previousHashes === null,
      });
    } catch (err) {
      logWarn('public contract type change measurement failed', { error: String(err) });
    }
    const lastSyncedAt = await writePublicContractOffersSnapshot(db, sortContractOfferRows(rows));
    await writePublicCourierContractsSnapshot(db, sortCourierContractRows(courierRows));
    if (typeHashes !== null) {
      await typeHashesRef
        .set({ hashes: typeHashes, updatedAt: Date.now() })
        .catch((err) =>
          logWarn('public contract type hashes write failed', { error: String(err) })
        );
    }
    if (fingerprint !== null) await fingerprintRef.set({ fingerprint, updatedAt: Date.now() });
    // Last, so a slow or failing R2 can never delay or skip the Firestore publish.
    // Courier first: one small object, so a slow offers upload cannot starve it of the time budget.
    await publishCourierToR2(db, courierRows, lastSyncedAt);
    await publishOffersToR2(db, rows, lastSyncedAt);
  }
);

/**
 * syncWorkbenchFits: EVE Workbench's public fits, grouped by hull into
 * `workbenchFits` for the Popular fit panel's EVE Workbench tab (issue
 * #2484). Workbench's list can't be filtered by hull, so this keeps our own
 * copy — see workbenchFits.ts for the pass/checkpoint design, and the
 * decision doc it ships with.
 *
 * Every 12 hours (cost: it was every 30 minutes), each run fetching for at most `WORKBENCH_FETCH_BUDGET_MS`
 * then flushing to Firestore. Requests are sequential with a 250ms gap (≤ 4/s
 * against a free, unauthenticated API), so a run stores roughly 1,000 fits:
 * the first pass over ~38k fits takes ~40 runs, about 20 days at this cadence, after which a run
 * is one list page plus however many fits were published since.
 *
 * The 360s budget leaves 180s of the 540s timeout for the flush, which reads
 * and rewrites every hull the run touched (a few hundred during the first
 * pass). A flush that overran the timeout would never save the checkpoint, so
 * every later run would redo the same pages — this margin is what prevents it.
 *
 * 1GiB because a run reads back every hull it touches whole (merge, then
 * re-split), and the most-fitted hulls are a few MB of EFT each.
 *
 * Another Cloud Scheduler job past the free three — the same trade
 * `captureMiningPriceSnapshot` already made.
 */
const WORKBENCH_FETCH_BUDGET_MS = 360_000;
const WORKBENCH_REQUEST_GAP_MS = 250;

export const syncWorkbenchFits = onSchedule(
  { schedule: 'every 12 hours', memory: '1GiB', timeoutSeconds: 540 },
  async () => {
    const result = await runWorkbenchSync({
      store: firestoreWorkbenchFitsStore(getFirestore()),
      fetchJson: async (url) => {
        const response = await fetch(url, {
          headers: { 'User-Agent': MARKET_HISTORY_USER_AGENT, Accept: 'application/json' },
        });
        const body: unknown = response.ok ? await response.json().catch(() => null) : null;
        return { status: response.status, retryAfter: response.headers.get('Retry-After'), body };
      },
      now: Date.now,
      sleep,
      budgetMs: WORKBENCH_FETCH_BUDGET_MS,
      requestGapMs: WORKBENCH_REQUEST_GAP_MS,
    });
    logInfo('EVE Workbench fits sync', { ...result });
  }
);

/**
 * syncLpStoreOffers: the LP Store page's item-first search (issue #2873). Reads
 * every LP corporation's public offers from ESI (~170 requests, paced) and
 * republishes them with each corporation's station systems to `lpStoreOffers`,
 * so the app can search an item across all stores and rank corporations by jumps.
 *
 * Once a day: store offers change on patch days, not by the hour. A run that
 * lost more than a tenth of the corporations (ESI down) publishes nothing and
 * leaves yesterday's snapshot standing, since the write replaces it wholesale.
 *
 * Another Cloud Scheduler job past the free three, the same trade as
 * `syncWorkbenchFits`; the deployment now has eight scheduled functions.
 */
const LP_STORE_MAX_FAILED_SHARE = 0.1;

export const syncLpStoreOffers = onSchedule(
  { schedule: 'every 24 hours', memory: '512MiB', timeoutSeconds: 540 },
  async () => {
    const { rows, failed } = await fetchLpStoreRows({
      corporations: LP_CORP_STATION_SYSTEMS,
      fetchJson: async (url) => {
        const response = await fetch(url, {
          headers: {
            'User-Agent': MARKET_HISTORY_USER_AGENT,
            'X-User-Agent': MARKET_HISTORY_USER_AGENT,
            'X-Compatibility-Date': '2026-08-01',
            Accept: 'application/json',
          },
        });
        const body: unknown = response.ok ? await response.json().catch(() => null) : null;
        return { status: response.status, retryAfter: response.headers.get('Retry-After'), body };
      },
      sleep,
      requestGapMs: LP_STORE_REQUEST_GAP_MS,
    });
    logInfo('LP store offers sync', { corporations: rows.length, failed: failed.length });
    if (rows.length === 0 || failed.length > Math.max(1, rows.length * LP_STORE_MAX_FAILED_SHARE)) {
      logError('LP store offers sync skipped publishing', { failed });
      return;
    }
    await writeChunkedSnapshot(getFirestore(), LP_STORE_OFFERS_SNAPSHOT, rows);
  }
);
