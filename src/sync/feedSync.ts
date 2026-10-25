import { collection, deleteDoc, doc } from 'firebase/firestore/lite';
import { db, type NotificationFeedRecord } from '@/db';
import { refreshAppBadge } from '@/features/notifications/appBadge';
import {
  FEED_SYNC_WINDOW_MS,
  mergeFeedRecord,
  rowsWithinSyncWindow,
  trimFeed,
} from '@/features/notifications/feed';
import { writePullCursor } from './localBookkeeping';
import { mergeFeed, type RemoteFeedDoc } from './merge';
import { NOTIFICATION_FEED } from './syncedCollections';
import { pullOwnedDocs, runBounded, setOwnedDoc, type SyncContext } from './collectionSync';

// ---------------------------------------------------------------------------
// Notification Feed sync (issue #362)
//
// Deliberate departure from the editable-collection sync: this collection has no
// tombstones (dismissal is a flag — see NotificationFeedRecord.dismissedAt)
// and its LWW field is `dismissedAt` alone, not a whole-record `updatedAt`
// (content never changes once a row is fired). merge.ts's `mergeFeed` encodes
// that directly rather than forcing it through mergeRecords' delete-aware
// shape.
//
// The remote copy is still bounded, though (issue #582): a remote row fired
// more than FEED_SYNC_WINDOW_MS ago is deleted outright — no tombstone, so
// nothing accumulates in its place. The same window that decides what a
// device starts pushing now also decides what stays up there — bounded,
// though, not expired to the day: an aged row's transport stamp no longer
// moves, so an incremental pull skips it and the periodic full reconcile is
// what brings it back into view. Call it 30-60 days. A purged row
// cannot ping-pong back: the purge cutoff and `pushEligible` are both
// derived from the one `ctx.now`, so anything purged is already outside the
// push window, and the device's own 300-row archive keeps the entry
// regardless.
//
// GLOSSARY.md round 45 describes device-detected rows as eventually uploading
// through the same callable Scheduled Push Projections use (issue #358),
// once that callable exists. It doesn't yet (#358 is still open, gated on
// #356/#357). Until then this uses the same ownerHash two-way sync every
// other Editable-Data-shaped collection here uses — the backend (once #358
// ships) can still write pushed rows into this same
// characters/{uid}/notificationFeed collection with admin privileges, which
// bypasses these rules entirely, so the two approaches aren't in conflict.
// ---------------------------------------------------------------------------

const NOTIFICATION_FEED_COLLECTION = NOTIFICATION_FEED.remoteName;

/** Remote Firestore doc at /characters/{uid}/notificationFeed/{id}. */
interface RemoteNotificationFeedDoc extends RemoteFeedDoc {
  characterId: number;
  eventId: string;
  title: string;
  body: string;
  eveType?: string;
  /** The row the alert was about, so the other device's link lands in the same place. */
  subjectId?: number;
  /** `subjectId`'s former name — read for rows written by the release that used it. */
  typeId?: number;
  fillMatch?: NotificationFeedRecord['fillMatch'];
  fillSettledAt?: number;
}

function toRemoteFeedDoc(
  row: NotificationFeedRecord,
  ownerHash: string,
  writeNow: number
): Record<string, unknown> {
  return {
    id: row.id,
    characterId: row.characterId,
    eventId: row.eventId,
    title: row.title,
    body: row.body,
    firedAt: row.firedAt,
    ...(row.eveType !== undefined ? { eveType: row.eveType } : {}),
    ...(row.subjectId !== undefined ? { subjectId: row.subjectId } : {}),
    ...(row.dismissedAt !== undefined ? { dismissedAt: row.dismissedAt } : {}),
    ...(row.fillMatch !== undefined ? { fillMatch: row.fillMatch } : {}),
    ...(row.fillSettledAt !== undefined ? { fillSettledAt: row.fillSettledAt } : {}),
    ownerHash,
    // Transport only — what an incremental pull cursors on (issue #581).
    // `mergeFeed` still keys on firedAt/dismissedAt and never reads this.
    //
    // A wall clock, not the row's own `max(firedAt, dismissedAt)` — see
    // `LocalFeedRow` for why the derived stamp hid rows from other devices.
    // `writeNow`, never `ctx.now`: a pass stamps `ctx.now` before a dozen
    // collections' round trips, and a doc written a minute later under a
    // stamp a minute old can land below a cursor another device has already
    // moved past. Nothing here re-dates the row itself — `firedAt` and
    // `dismissedAt` go up untouched, and stay the only fields `mergeFeed` reads.
    updatedAt: writeNow,
  };
}

/**
 * `local` is this device's own copy, present only when a pull is carrying an
 * existing row's dismissal across (`mergeFeed`'s `pullDismiss`). The merge
 * itself is `features/notifications/feed.mergeFeedRecord`'s — a pull must not
 * be the one writer that re-dates a row.
 */
function toLocalFeedRecord(
  remote: RemoteNotificationFeedDoc,
  writeNow: number,
  local?: NotificationFeedRecord
): NotificationFeedRecord {
  return mergeFeedRecord(local, {
    // Seen in the remote collection, so the remote side demonstrably holds it
    // — the same fact a successful push records, learned a step later.
    syncedAt: writeNow,
    id: remote.id,
    characterId: remote.characterId,
    eventId: remote.eventId,
    title: remote.title,
    body: remote.body,
    firedAt: remote.firedAt,
    ...(remote.eveType !== undefined ? { eveType: remote.eveType } : {}),
    ...((remote.subjectId ?? remote.typeId) !== undefined
      ? { subjectId: remote.subjectId ?? remote.typeId }
      : {}),
    ...(remote.dismissedAt !== undefined ? { dismissedAt: remote.dismissedAt } : {}),
    ...(remote.fillMatch !== undefined ? { fillMatch: remote.fillMatch } : {}),
    ...(remote.fillSettledAt !== undefined ? { fillSettledAt: remote.fillSettledAt } : {}),
  });
}

export async function syncFeed(ctx: SyncContext): Promise<void> {
  const col = collection(ctx.firestore, 'characters', ctx.uid, NOTIFICATION_FEED_COLLECTION);
  const pull = await pullOwnedDocs<RemoteNotificationFeedDoc>(
    col,
    ctx,
    NOTIFICATION_FEED_COLLECTION
  );
  const remote = pull.remote;
  // Feed rows for every Character share one local table (the Alerts page
  // shows them together); only this Character's own rows sync to its uid.
  const local = await db.notificationFeed
    .where('characterId')
    .equals(ctx.characterId)
    .reverse()
    .sortBy('firedAt');
  const pushEligible = new Set(rowsWithinSyncWindow(local, ctx.now).map((row) => row.id));

  const plan = mergeFeed<NotificationFeedRecord, RemoteNotificationFeedDoc>(
    local,
    pushEligible,
    remote,
    ctx.now,
    FEED_SYNC_WINDOW_MS
  );

  const writeNow = Date.now();
  const remoteById = new Map(remote.map((row) => [row.id, row]));
  // A re-date pushes the merge of both copies, not the local row alone: the
  // remote doc is replaced wholesale, and anything only it holds would go.
  const redated = plan.pushRedate.map((row) => {
    const remoteRow = remoteById.get(row.id);
    return remoteRow === undefined ? row : toLocalFeedRecord(remoteRow, writeNow, row);
  });
  const pushed = [...plan.pushCreate, ...plan.pushDismiss, ...redated];
  if (pushed.length > 0) ctx.onPush?.();
  await runBounded([
    ...pushed.map(
      (row) => () => setOwnedDoc(doc(col, row.id), toRemoteFeedDoc(row, ctx.ownerHash, writeNow))
    ),
    ...plan.purgeRemote.map((id) => () => deleteDoc(doc(col, id))),
  ]);

  const localById = new Map(local.map((row) => [row.id, row]));
  // What this pass now knows the remote side holds: what it just wrote, and
  // what it read back unchanged. Without the second half a row both sides
  // already had — one the Scheduled Push handler wrote here and the other
  // device uploaded — would stay unmarked and re-push on every pass.
  //
  // Marked only after the writes land: a `syncedAt` on a row that never
  // reached Firestore is a row this device has silently agreed never to
  // upload again. A throw here leaves it unmarked and the next pass
  // re-pushes, which is the harmless direction to fail in.
  const knownRemote = [
    ...pushed.map((row) => row.id),
    ...remote.map((row) => row.id).filter((id) => localById.has(id)),
  ];
  if (knownRemote.length > 0) {
    await db.notificationFeed.where('id').anyOf(knownRemote).modify({ syncedAt: writeNow });
  }

  const pulled = [...plan.pullCreate, ...plan.pullDismiss, ...plan.pullRedate].map((row) =>
    toLocalFeedRecord(row, writeNow, localById.get(row.id))
  );
  if (pulled.length > 0) {
    await db.notificationFeed.bulkPut(pulled);
    // Excluding what this pull just wrote, or a back-dated row would be
    // trimmed on arrival and pulled again on the next sync, forever.
    await trimFeed(new Set(pulled.map((row) => row.id)));
    await refreshAppBadge();
  }

  await writePullCursor(pull.cursorKey, pull.next);
}
