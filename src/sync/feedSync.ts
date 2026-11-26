import { collection, deleteDoc, doc } from 'firebase/firestore/lite';
import { db, type NotificationFeedRecord } from '@/db';
import { refreshAppBadge } from '@/features/notifications/appBadge';
import {
  FEED_SYNC_WINDOW_MS,
  isDeviceLocalFeedRow,
  mergeFeedRecord,
  rowsWithinSyncWindow,
  trimFeed,
} from '@/features/notifications/feed';
import { writePullCursor } from './localBookkeeping';
import { mergeFeed, type RemoteFeedDoc } from './merge';
import { NOTIFICATION_FEED } from './syncedCollections';
import { pullOwnedDocs, runBounded, setOwnedDoc, type SyncContext } from './collectionSync';

const NOTIFICATION_FEED_COLLECTION = NOTIFICATION_FEED.remoteName;

interface RemoteNotificationFeedDoc extends RemoteFeedDoc {
  characterId: number;
  eventId: string;
  title: string;
  body: string;
  eveType?: string;
  subjectId?: number;
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
    updatedAt: writeNow,
  };
}

function toLocalFeedRecord(
  remote: RemoteNotificationFeedDoc,
  writeNow: number,
  local?: NotificationFeedRecord
): NotificationFeedRecord {
  return mergeFeedRecord(local, {
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
  const local = await db.notificationFeed
    .where('characterId')
    .equals(ctx.characterId)
    .reverse()
    .sortBy('firedAt');
  const pushEligible = new Set(
    rowsWithinSyncWindow(
      local.filter((row) => !isDeviceLocalFeedRow(row)),
      ctx.now
    ).map((row) => row.id)
  );

  const plan = mergeFeed<NotificationFeedRecord, RemoteNotificationFeedDoc>(
    local,
    pushEligible,
    remote,
    ctx.now,
    FEED_SYNC_WINDOW_MS
  );

  const writeNow = Date.now();
  const remoteById = new Map(remote.map((row) => [row.id, row]));
  const redated = plan.pushRedate.map((row) => {
    const remoteRow = remoteById.get(row.id);
    return remoteRow === undefined ? row : toLocalFeedRecord(remoteRow, writeNow, row);
  });
  const pushed = [...plan.pushCreate, ...plan.pushDismiss, ...redated];
  if (pushed.length > 0) ctx.onPush?.();
  await runBounded([
    ...pushed.map(
      (row) => () =>
        setOwnedDoc(doc(col, row.id), toRemoteFeedDoc(row, ctx.ownerHash, writeNow), ctx)
    ),
    ...plan.purgeRemote.map((id) => () => deleteDoc(doc(col, id))),
  ]);

  const localById = new Map(local.map((row) => [row.id, row]));
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
    await trimFeed(new Set(pulled.map((row) => row.id)));
    await refreshAppBadge();
  }

  await writePullCursor(pull.cursorKey, pull.next);
}
