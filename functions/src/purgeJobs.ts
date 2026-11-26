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
  isFullScanDay,
  lastSyncedAtOf,
  staleAccountCutoff,
} from './purgeStaleAccounts.js';
import { isMissingIndex } from './indexedSweep.js';

export async function runPurgeNotificationFeed(): Promise<void> {
  const db = firestore();
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

    if (snapshot.size < FEED_PURGE_BATCH_SIZE) return;
  }

  logWarn('Notification Feed purge: pass limit reached, backlog continues next run', {
    cutoff,
    deleted,
  });
}

export interface StaleAccountPurgeDeps {
  alertGrantDeps: () => AlertGrantDeps;
  corpSyncDeps: () => CorpSyncDeps;
}

async function staleAccountRefs(
  db: FirebaseFirestore.Firestore,
  now: number
): Promise<FirebaseFirestore.DocumentReference[]> {
  const characters = db.collection('characters');
  if (!isFullScanDay(now)) {
    try {
      const stale = await characters
        .where(LAST_SYNCED_FIELD, '<', staleAccountCutoff(now))
        .select(LAST_SYNCED_FIELD)
        .get();
      return stale.docs
        .filter((doc) => decideAccountAction(lastSyncedAtOf(doc.data()), now) === 'purge')
        .map((doc) => doc.ref);
    } catch (err) {
      if (!isMissingIndex(err)) throw err;
      logWarn('Stale account purge: heartbeat index missing, using the full scan');
    }
  }

  const all = await characters.listDocuments();
  const snaps = new Map<string, FirebaseFirestore.DocumentSnapshot>();
  for (let i = 0; i < all.length; i += STALE_ACCOUNT_READ_PAGE_SIZE) {
    const page = all.slice(i, i + STALE_ACCOUNT_READ_PAGE_SIZE);
    for (const snap of await db.getAll(...page, { fieldMask: [LAST_SYNCED_FIELD] })) {
      snaps.set(snap.ref.path, snap);
    }
  }
  const refs: FirebaseFirestore.DocumentReference[] = [];
  for (const ref of all) {
    const action = decideAccountAction(lastSyncedAtOf(snaps.get(ref.path)?.data()), now);
    if (action === 'seed') await ref.set({ [LAST_SYNCED_FIELD]: now }, { merge: true });
    if (action === 'purge') refs.push(ref);
  }
  return refs;
}

export async function runPurgeStaleAccounts({
  alertGrantDeps,
  corpSyncDeps,
}: StaleAccountPurgeDeps): Promise<void> {
  const db = firestore();
  const now = Date.now();
  let passes = 0;
  let purged = 0;

  const refs = await staleAccountRefs(db, now);
  for (const ref of refs) {
    try {
      await purgeCharacterCommunities(db, ref.id);
    } catch (err) {
      logWarn('Stale account purge: Community cleanup failed, will retry', {
        uid: ref.id,
        error: err instanceof Error ? err.message : err,
      });
      continue;
    }

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
