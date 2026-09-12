// mintFirebaseToken: exchange a verified EVE access token for a Firebase
// custom token. The EVE *refresh* token never reaches this backend (ADR 0001);
// the client sends only its short-lived access token, which is verified
// against EVE's published JWKS before any Firebase credential is minted.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { error as logError, info as logInfo, warn as logWarn } from 'firebase-functions/logger';
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
import {
  FEED_PURGE_BATCH_SIZE,
  FEED_PURGE_MAX_PASSES,
  NOTIFICATION_FEED_COLLECTION,
  feedPurgeCutoff,
} from './purgeFeed.js';
import { streamPublicContractsCsvs } from './publicContractsArchive.js';
import {
  chunkDocId,
  chunkRows,
  compactBpcItemRow,
  compactContractOfferRow,
  eligibleContractFrom,
  sortBpcRows,
  sortContractOfferRows,
  DEFAULT_CHUNK_SIZE,
  PUBLIC_BPC_CONTRACTS_COLLECTION,
  PUBLIC_BPC_CONTRACTS_META_DOC,
  PUBLIC_CONTRACT_OFFERS_CHUNK_SIZE,
  PUBLIC_CONTRACT_OFFERS_COLLECTION,
  PUBLIC_CONTRACT_OFFERS_META_DOC,
  type BpcContractRow,
  type EligibleContract,
  type PublicContractOfferRow,
} from './publicContracts.js';

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
 * CONTEXT.md round 45). Runs every 5 minutes, matching the Foreground
 * Poller's own cadence (`POLL_INTERVAL_MS`). One of this deployment's two
 * Cloud Scheduler jobs — `purgeNotificationFeed` below is the other.
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

/** Firestore's hard cap on writes in a single `WriteBatch`, with headroom for a shorter final page. */
const BATCH_WRITE_PAGE_SIZE = 450;

/**
 * Applies more write operations than fit in one `WriteBatch` by paging them
 * across several.
 *
 * `pageSize` exists because the op *count* is not always the binding limit.
 * `commit()` is where the Admin SDK encodes each document — `batch.set()` only
 * stores it — so a page of documents that are individually large costs a
 * transient proportional to the whole page. The BPC snapshot's ~370KB chunk
 * docs need a much smaller page than the default; small per-doc writers can
 * keep filling batches to Firestore's own limit.
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
 * at ~370KB of row JSON each, committing all ~62 in one batch encodes the
 * entire snapshot at once, which is what exhausted the 512MiB container even
 * after the parse itself had been made cheap. Eight keeps that transient near
 * 3MB. The total write count is unchanged — this only affects how many are
 * in flight together.
 */
const PUBLIC_BPC_CHUNK_DOCS_PER_BATCH = 8;

/**
 * Same reasoning as `PUBLIC_BPC_CHUNK_DOCS_PER_BATCH`, one size down: the
 * generalized snapshot's chunks hold 3,000 rows rather than 2,000, so five of
 * them keep the encode-at-commit transient in the same ~3MB neighbourhood
 * eight of the smaller ones do.
 */
const PUBLIC_CONTRACT_OFFERS_CHUNK_DOCS_PER_BATCH = 5;

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
 * Shared by both public-contract syncs (issues #608 and #906). They publish
 * different rows to different collections at different chunk sizes; how a
 * snapshot is replaced is not one of the things they differ in.
 */
async function writeChunkedSnapshot<Row>(
  db: Firestore,
  snapshot: ChunkedSnapshot,
  rows: readonly Row[]
): Promise<void> {
  const collection = db.collection(snapshot.collection);
  const metaRef = collection.doc(snapshot.metaDoc);
  const previousChunkCount = ((await metaRef.get()).data()?.chunkCount as number | undefined) ?? 0;

  const chunks = chunkRows(rows, snapshot.chunkSize);
  const ops: ((batch: FirebaseFirestore.WriteBatch) => void)[] = chunks.map((chunk, index) => {
    const ref = collection.doc(chunkDocId(index));
    return (batch) => batch.set(ref, { rows: chunk });
  });
  for (let i = chunks.length; i < previousChunkCount; i += 1) {
    const ref = collection.doc(chunkDocId(i));
    ops.push((batch) => batch.delete(ref));
  }
  await commitInPages(db, ops, snapshot.chunkDocsPerBatch);

  await metaRef.set({
    lastSyncedAt: Date.now(),
    chunkCount: chunks.length,
    rowCount: rows.length,
  });
}

const PUBLIC_BPC_CONTRACTS_SNAPSHOT: ChunkedSnapshot = {
  collection: PUBLIC_BPC_CONTRACTS_COLLECTION,
  metaDoc: PUBLIC_BPC_CONTRACTS_META_DOC,
  chunkSize: DEFAULT_CHUNK_SIZE,
  chunkDocsPerBatch: PUBLIC_BPC_CHUNK_DOCS_PER_BATCH,
};

const PUBLIC_CONTRACT_OFFERS_SNAPSHOT: ChunkedSnapshot = {
  collection: PUBLIC_CONTRACT_OFFERS_COLLECTION,
  metaDoc: PUBLIC_CONTRACT_OFFERS_META_DOC,
  chunkSize: PUBLIC_CONTRACT_OFFERS_CHUNK_SIZE,
  chunkDocsPerBatch: PUBLIC_CONTRACT_OFFERS_CHUNK_DOCS_PER_BATCH,
};

async function writePublicBpcContractsSnapshot(
  db: Firestore,
  rows: readonly BpcContractRow[]
): Promise<void> {
  await writeChunkedSnapshot(db, PUBLIC_BPC_CONTRACTS_SNAPSHOT, rows);
}

async function writePublicContractOffersSnapshot(
  db: Firestore,
  rows: readonly PublicContractOfferRow[]
): Promise<void> {
  await writeChunkedSnapshot(db, PUBLIC_CONTRACT_OFFERS_SNAPSHOT, rows);
}

/**
 * syncPublicBpcContracts: the public BPC contract search's data source
 * (issue #608, ADR 0013). Pulls EVE Ref's public-contracts snapshot (no CORS,
 * so the client can't fetch it directly), filters it down to blueprint
 * copies offered for sale, and republishes the small result to
 * `publicBpcContracts` for signed-in clients to search.
 *
 * Every 30 minutes, matching EVE Ref's own twice-hourly refresh cadence.
 *
 * The archive is streamed rather than buffered: `contracts.csv` is read into
 * a lookup of only the fields the join needs, then `contract_items.csv` is
 * joined against it row by row. Holding the two CSVs as text and parsing them
 * whole needed ~1.1GB of heap for 37MB of input; the streaming pass peaks near
 * 150MB against the same live data.
 *
 * Memory stays at 1GiB even so. The parse is no longer what needs the room —
 * the ~122k joined rows are retained until the snapshot is written, and the
 * write encodes them on top of that. A 512MiB ceiling was tried and died
 * during the write at 527MiB, having got all the way through the parse.
 */
export const syncPublicBpcContracts = onSchedule(
  { schedule: 'every 30 minutes', memory: '1GiB', timeoutSeconds: 300 },
  async () => {
    const nowMs = Date.now();
    const eligibleContracts = new Map<string, EligibleContract>();
    const rows: BpcContractRow[] = [];

    await streamPublicContractsCsvs({
      onContract: (record) => {
        const eligible = eligibleContractFrom(record, nowMs);
        if (eligible) eligibleContracts.set(record.contract_id, eligible);
      },
      onItem: (record) => {
        const contract = eligibleContracts.get(record.contract_id);
        if (!contract) return;
        const row = compactBpcItemRow(record, contract);
        if (row) rows.push(row);
      },
    });

    logInfo('public BPC contract sync', {
      eligibleContracts: eligibleContracts.size,
      rows: rows.length,
    });

    // The lookup is dead once the join is done, and it is ~50k objects the
    // write would otherwise be encoding rows alongside.
    eligibleContracts.clear();
    await writePublicBpcContractsSnapshot(getFirestore(), sortBpcRows(rows));
  }
);

/**
 * syncPublicContractOffers: the same pipeline as `syncPublicBpcContracts`
 * above, minus the blueprint-copy filter (issue #906). Every for-sale line of
 * every public item_exchange/auction contract, any item type, republished to
 * `publicContractOffers` for signed-in clients to search.
 *
 * It runs *alongside* the blueprint-only sync rather than replacing it: this
 * is the expand half of an expand/contract. `publicBpcContracts` still backs
 * BPC Sourcing until #907 moves it over, at which point this function and its
 * collection become the single source and the older pair is retired. Until
 * then the archive is fetched twice per cycle — deliberate duplication with a
 * scheduled end, not a shared fetch worth building.
 *
 * Memory is 2GiB against the blueprint sync's 1GiB, and the timeout 540s
 * against 300s. Neither is measured at this volume; both are provisioned for
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
 * This is also the deployment's fourth Cloud Scheduler job, past the 3 free
 * per billing account that ADR 0013 budgeted against — a few cents a month,
 * and it goes back to 3 when #907 retires the blueprint-only sync.
 */
export const syncPublicContractOffers = onSchedule(
  { schedule: 'every 30 minutes', memory: '2GiB', timeoutSeconds: 540 },
  async () => {
    const nowMs = Date.now();
    const eligibleContracts = new Map<string, EligibleContract>();
    const rows: PublicContractOfferRow[] = [];

    await streamPublicContractsCsvs({
      onContract: (record) => {
        const eligible = eligibleContractFrom(record, nowMs);
        if (eligible) eligibleContracts.set(record.contract_id, eligible);
      },
      onItem: (record) => {
        const contract = eligibleContracts.get(record.contract_id);
        if (!contract) return;
        const row = compactContractOfferRow(record, contract);
        if (row) rows.push(row);
      },
    });

    logInfo('public contract offers sync', {
      eligibleContracts: eligibleContracts.size,
      rowCount: rows.length,
    });

    // The lookup is dead once the join is done, and it is ~50k objects the
    // write would otherwise be encoding rows alongside.
    eligibleContracts.clear();
    await writePublicContractOffersSnapshot(getFirestore(), sortContractOfferRows(rows));
  }
);
