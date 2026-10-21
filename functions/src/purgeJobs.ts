import { warn as logWarn } from 'firebase-functions/logger';
import { firestore } from './firestore.js';
import { characterIdForUid } from './verifyEveToken.js';
import { deleteAlertGrant as deleteAlertGrantFor, type AlertGrantDeps } from './alertGrant.js';
import { deleteCorpSyncGrantsHeldBy, type CorpSyncDeps } from './corpSyncGrant.js';
import { purgeCharacterCommunities } from './communitiesStore.js';
import {
  FEED_PURGE_BATCH_SIZE,
  FEED_PURGE_MAX_PASSES,
  NOTIFICATION_FEED_COLLECTION,
  feedPurgeCutoff,
} from './purgeFeed.js';
import {
  LAST_SYNCED_FIELD,
  STALE_ACCOUNT_BATCH_SIZE,
  STALE_ACCOUNT_READ_PAGE_SIZE,
  STALE_ACCOUNT_MAX_PASSES,
  decideAccountAction,
  lastSyncedAtOf,
} from './purgeStaleAccounts.js';

/** The Notification Feed purge, a task of `dailyHousekeeping` (see its doc in index.ts). */
export async function runPurgeNotificationFeed(): Promise<void> {
  const db = firestore();
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
}

/** The index.ts-owned dependency factories the stale-account purge needs. */
export interface StaleAccountPurgeDeps {
  alertGrantDeps: () => AlertGrantDeps;
  corpSyncDeps: () => CorpSyncDeps;
}

/** The stale-account purge, a task of `dailyHousekeeping` (see its doc in index.ts). */
export async function runPurgeStaleAccounts({
  alertGrantDeps,
  corpSyncDeps,
}: StaleAccountPurgeDeps): Promise<void> {
  const db = firestore();
  const now = Date.now();
  let passes = 0;
  let purged = 0;

  const refs = await db.collection('characters').listDocuments();
  const snaps = new Map<string, FirebaseFirestore.DocumentSnapshot>();
  // Heartbeat reads are batched and masked to the one field the decision
  // needs; the rest of each parent doc is never loaded.
  for (let i = 0; i < refs.length; i += STALE_ACCOUNT_READ_PAGE_SIZE) {
    const page = refs.slice(i, i + STALE_ACCOUNT_READ_PAGE_SIZE);
    for (const snap of await db.getAll(...page, { fieldMask: [LAST_SYNCED_FIELD] })) {
      snaps.set(snap.ref.path, snap);
    }
  }

  for (const ref of refs) {
    const snap = snaps.get(ref.path);
    const action = decideAccountAction(lastSyncedAtOf(snap?.data()), now);
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

    // So does any Corp Tax Book sync grant it holds (ADR 0025).
    try {
      const characterId = characterIdForUid(ref.id);
      if (characterId !== undefined) {
        await deleteCorpSyncGrantsHeldBy(corpSyncDeps(), characterId);
      }
    } catch (err) {
      logWarn('Stale account purge: Corp sync grant cleanup failed, will retry', {
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
