import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  setDoc,
  where,
  type CollectionReference,
  type DocumentData,
  type DocumentReference,
  type Firestore,
} from 'firebase/firestore/lite';
import { db, type PlanetRichnessRecord, type StationPinRecord } from '@/db';
import { planetRichnessDeletedAtByKey, stationPinDeletedAtByKey } from './accountWideBackfill';
import { mapWithConcurrencyLimit } from '@/lib/concurrency';
import {
  readTombstones,
  tombstoneKey,
  pullCursorKey,
  readPullCursor,
  writePullCursor,
  type PullCursor,
} from './localBookkeeping';
import { isMissingIndex } from './missingIndex';
import { mergeRecords, TOMBSTONE_TTL_MS, type LocalTombstone, type RemoteDoc } from './merge';
import {
  PLANET_RICHNESS,
  STATION_PINS,
  type EditableCollection,
  type EditableRecord,
} from './syncedCollections';

const PUSH_CONCURRENCY = 20;

export async function runBounded(writes: (() => Promise<unknown>)[]): Promise<void> {
  await mapWithConcurrencyLimit(writes, PUSH_CONCURRENCY, async (write) => {
    await write();
  });
}

export async function setOwnedDoc(
  ref: DocumentReference,
  data: DocumentData,
  ctx: SyncContext
): Promise<void> {
  try {
    await setDoc(ref, data);
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code !== 'permission-denied') throw error;
    if (!(await ctx.confirmOwner?.())) throw error;
    await deleteDoc(ref);
    await setDoc(ref, data);
  }
}

async function writeTombstones(key: string, tombstones: LocalTombstone[]): Promise<void> {
  await db.settings.put({ key, value: tombstones });
}

interface AccountWideMerge<L extends EditableRecord> {
  sharedKey: (record: L) => string | undefined;
  deletedAtByKey: () => Promise<Map<string, number>>;
}

function accountWideMerge<L extends EditableRecord>(
  collection: EditableCollection<L, RemoteDoc & L>,
  merge: AccountWideMerge<L>
): [EditableCollection, AccountWideMerge<EditableRecord>] {
  return [collection as EditableCollection, merge as AccountWideMerge<EditableRecord>];
}

const ACCOUNT_WIDE_MERGES = new Map([
  accountWideMerge<StationPinRecord>(STATION_PINS, {
    sharedKey: (row) => (row.scope === 'account' ? String(row.locationId) : undefined),
    deletedAtByKey: stationPinDeletedAtByKey,
  }),
  accountWideMerge<PlanetRichnessRecord>(PLANET_RICHNESS, {
    sharedKey: (row) => String(row.planetId),
    deletedAtByKey: planetRichnessDeletedAtByKey,
  }),
]);

export interface SyncContext {
  firestore: Firestore;
  uid: string;
  ownerHash: string;
  characterId: number;
  now: number;
  onPush?: () => void;
  confirmOwner?: () => Promise<boolean>;
}

async function fetchOwnedDocs<R extends { ownerHash: string }>(
  col: CollectionReference,
  ownerHash: string,
  since?: number
): Promise<R[]> {
  const owned = where('ownerHash', '==', ownerHash);
  const snapshot = await getDocs(
    since === undefined ? query(col, owned) : query(col, owned, where('updatedAt', '>', since))
  );
  return snapshot.docs.map((d) => d.data() as R);
}

const FULL_RECONCILE_INTERVAL_MS = TOMBSTONE_TTL_MS;

interface PullWindow<R> {
  remote: R[];
  since: number | undefined;
  cursorKey: string;
  next: PullCursor;
}

export async function pullOwnedDocs<R extends { ownerHash: string; updatedAt?: number }>(
  col: CollectionReference,
  ctx: SyncContext,
  collectionName: string,
  forceFull = false
): Promise<PullWindow<R>> {
  const cursorKey = pullCursorKey(ctx.characterId, collectionName);
  const cursor = await readPullCursor(cursorKey);
  const fresh =
    !forceFull && cursor !== undefined && ctx.now - cursor.fullAt <= FULL_RECONCILE_INTERVAL_MS;
  let since = fresh ? cursor.high : undefined;
  let remote: R[];
  try {
    remote = await fetchOwnedDocs<R>(col, ctx.ownerHash, since);
  } catch (err) {
    if (since === undefined || !isMissingIndex(err)) throw err;
    since = undefined;
    remote = await fetchOwnedDocs<R>(col, ctx.ownerHash);
  }
  const observed = remote.reduce((high, d) => Math.max(high, d.updatedAt ?? 0), 0);
  return {
    remote,
    since,
    cursorKey,
    next:
      since === undefined
        ? { high: observed, fullAt: ctx.now }
        : { high: Math.max(since, observed), fullAt: cursor?.fullAt ?? ctx.now },
  };
}

export async function syncEditableCollection(
  spec: EditableCollection,
  ctx: SyncContext
): Promise<void> {
  const col = collection(ctx.firestore, 'characters', ctx.uid, spec.remoteName);
  const pull = await pullOwnedDocs<RemoteDoc>(col, ctx, spec.remoteName);
  const remote = pull.remote;
  const table = db.table<EditableRecord, string>(spec.table);
  const local = await table.where('characterId').equals(ctx.characterId).toArray();
  const tombstonesKey = tombstoneKey(spec, ctx.characterId);
  const tombstones = await readTombstones(tombstonesKey);
  const accountWideHooks = ACCOUNT_WIDE_MERGES.get(spec);
  const accountWide = accountWideHooks
    ? {
        sharedKey: accountWideHooks.sharedKey,
        deletedAtByKey: await accountWideHooks.deletedAtByKey(),
      }
    : undefined;
  const plan = mergeRecords<EditableRecord, RemoteDoc>(
    local,
    tombstones,
    remote,
    ctx.now,
    accountWide,
    pull.since
  );

  if (plan.pushUpserts.length > 0 || plan.pushTombstones.length > 0) ctx.onPush?.();
  await runBounded([
    ...plan.pushUpserts.map(
      (p) => () => setOwnedDoc(doc(col, p.id), spec.toRemoteDoc(p, ctx.ownerHash), ctx)
    ),
    ...plan.pushTombstones.map(
      (t) => () =>
        setOwnedDoc(
          doc(col, t.id),
          {
            id: t.id,
            characterId: ctx.characterId,
            updatedAt: t.deletedAt,
            ownerHash: ctx.ownerHash,
            deleted: true,
          },
          ctx
        )
    ),
    ...plan.purgeRemote.map((id) => () => deleteDoc(doc(col, id))),
  ]);

  if (plan.pullUpserts.length > 0) {
    await table.bulkPut(plan.pullUpserts.map((r) => spec.toLocalRecord(r)));
  }
  if (plan.deleteLocal.length > 0) {
    await table.bulkDelete(plan.deleteLocal);
  }
  const remoteById = new Map(remote.map((r) => [r.id, r]));
  const pushTombstoneById = new Map(plan.pushTombstones.map((t) => [t.id, t.deletedAt]));
  const learned: LocalTombstone[] = plan.deleteLocal.flatMap((id) => {
    const deletedAt = pushTombstoneById.get(id) ?? remoteById.get(id)?.updatedAt;
    return deletedAt !== undefined ? [{ id, deletedAt }] : [];
  });
  const settled = new Set([...plan.clearLocalTombstones, ...plan.pushTombstones.map((t) => t.id)]);
  if (settled.size > 0 || learned.length > 0) {
    await writeTombstones(tombstonesKey, [
      ...tombstones.filter((t) => !settled.has(t.id) && !learned.some((l) => l.id === t.id)),
      ...learned,
    ]);
  }

  await writePullCursor(pull.cursorKey, pull.next);
}
