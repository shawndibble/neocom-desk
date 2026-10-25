// Per-collection two-way sync passes (pull, merge, push) for one character:
// every editable collection. The Notification Feed and synced settings passes
// live in feedSync.ts and settingsSync.ts. planSync.ts owns the driver
// (syncCharacter) and the mutation API and calls these; none of them import it back.
// Merge policy is pure and lives in merge.ts.

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  setDoc,
  where,
  type CollectionReference,
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

async function writeTombstones(key: string, tombstones: LocalTombstone[]): Promise<void> {
  await db.settings.put({ key, value: tombstones });
}

// ---------------------------------------------------------------------------
// Generic editable-collection sync (every EDITABLE_COLLECTIONS declaration)
// ---------------------------------------------------------------------------

/**
 * Account-wide collections only (issue #436): the shared key a deletion is
 * recognized by regardless of which Character's id a row was copied onto,
 * and the current per-key deletion times to check it against. See
 * `AccountWideTombstones` in merge.ts.
 *
 * Merge policy, not part of a collection's declaration: its `deletedAtByKey`
 * comes from accountWideBackfill.ts, which itself reads the registry.
 */
interface AccountWideMerge<L extends EditableRecord> {
  sharedKey: (record: L) => string | undefined;
  deletedAtByKey: () => Promise<Map<string, number>>;
}

/** Pairs a merge hook with its typed declaration, then erases the row type for the lookup below. */
function accountWideMerge<L extends EditableRecord>(
  collection: EditableCollection<L, RemoteDoc & L>,
  merge: AccountWideMerge<L>
): [EditableCollection, AccountWideMerge<EditableRecord>] {
  return [collection as EditableCollection, merge as AccountWideMerge<EditableRecord>];
}

const ACCOUNT_WIDE_MERGES = new Map([
  accountWideMerge<StationPinRecord>(STATION_PINS, {
    // Only an account-wide row can be resurrected onto a Character added
    // after the delete (accountWideBackfill.ts only ever copies `scope:
    // 'account'` rows) — a `character`-scoped pin at the same locationId
    // must not be caught by a deletion that only ever applied to the
    // account-wide one.
    sharedKey: (row) => (row.scope === 'account' ? String(row.locationId) : undefined),
    deletedAtByKey: stationPinDeletedAtByKey,
  }),
  accountWideMerge<PlanetRichnessRecord>(PLANET_RICHNESS, {
    // Every row is account-wide — no per-Character variant exists to opt out.
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
  /** Called after a pass pushes at least one doc, so the driver bumps the change marker. */
  onPush?: () => void;
}

/**
 * The only remote read in the app, and the only reason any field of a synced
 * document is indexed at all.
 *
 * `firestore.indexes.json` exempts every field of every synced collection
 * group from automatic indexing (`fieldPath: "*"`) and re-enables exactly
 * one: `ownerHash` — issue #583, which is what stops Firestore storing an
 * index entry per skill in a plan queue, per Quickbar item and per ore line
 * for queries nobody makes. **So adding a `where(...)` or `orderBy(...)` on
 * any other field here needs that field re-enabled in `fieldOverrides`
 * first, and the exemptions redeployed.** A composite index still covers its
 * own fields (an exemption applies only to automatic indexing), which is how
 * the incremental pull's `updatedAt` filter below works without one.
 *
 * Miss that and the query throws `failed-precondition` at runtime — the same
 * error a missing *composite* index gives, so it reads as one. `isMissingIndex`'s
 * full read is no safety net here either: it filters on `ownerHash` too.
 */
async function fetchOwnedDocs<R extends { ownerHash: string }>(
  col: CollectionReference,
  ownerHash: string,
  since?: number
): Promise<R[]> {
  // Rules allow listing only what the client's where clause provably scopes to;
  // an unfiltered getDocs would also trip over stale-hash docs after a transfer.
  const owned = where('ownerHash', '==', ownerHash);
  const snapshot = await getDocs(
    since === undefined ? query(col, owned) : query(col, owned, where('updatedAt', '>', since))
  );
  return snapshot.docs.map((d) => d.data() as R);
}

// ---------------------------------------------------------------------------
// Incremental pull (issue #581)
//
// Every pass used to re-read every owned doc in all 12 collections — a full
// collection scan each, on app start, on every Character switch and 2s after
// every mutation. Firestore bills per document read, so that cost grows with
// users x mutations x accumulated rows while the stored data barely moves.
//
// So each (Character, collection) carries a pull cursor and the read is
// filtered to `updatedAt > cursor`. Remote tombstones are ordinary docs
// carrying `updatedAt`, so a delete arrives through that window exactly like
// an edit. What a partial remote set costs is the two `mergeRecords`
// decisions that used to read remote *absence* — see its `since` docstring.
//
// The Notification Feed (feedSync.ts) and synced settings (settingsSync.ts,
// issue #5045) read through the same cursor; `mergeFeed` and `mergeSettings`
// each document how they read a partial remote set.
// ---------------------------------------------------------------------------

/** How stale a cursor may get before the pass falls back to an unfiltered read. */
const FULL_RECONCILE_INTERVAL_MS = TOMBSTONE_TTL_MS;

interface PullWindow<R> {
  /** The docs to merge: the whole owned set, or only what changed since the cursor. */
  remote: R[];
  /** Lower bound the merge must assume, or `undefined` when this was a full read. */
  since: number | undefined;
  /** Where to store `next`, once the pass has applied everything it read. */
  cursorKey: string;
  next: PullCursor;
}

/**
 * `forceFull` makes this pass an unfiltered read whatever the cursor says, for
 * a caller whose local state a window cannot reconcile (settingsSync.ts, an
 * unstamped value). It is recorded as a full read like any other.
 */
export async function pullOwnedDocs<R extends { ownerHash: string; updatedAt?: number }>(
  col: CollectionReference,
  ctx: SyncContext,
  collectionName: string,
  forceFull = false
): Promise<PullWindow<R>> {
  const cursorKey = pullCursorKey(ctx.characterId, collectionName);
  const cursor = await readPullCursor(cursorKey);
  // No cursor at all = an in-place upgrade, or a fresh device: full read, so
  // pre-existing remote docs can never be missed.
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
  // The high-water mark actually observed, never `ctx.now` (see PullCursor).
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
      (p) => () => setDoc(doc(col, p.id), spec.toRemoteDoc(p, ctx.ownerHash))
    ),
    ...plan.pushTombstones.map(
      (t) => () =>
        setDoc(doc(col, t.id), {
          id: t.id,
          characterId: ctx.characterId,
          updatedAt: t.deletedAt,
          ownerHash: ctx.ownerHash,
          deleted: true,
        })
    ),
    ...plan.purgeRemote.map((id) => () => deleteDoc(doc(col, id))),
  ]);

  if (plan.pullUpserts.length > 0) {
    await table.bulkPut(plan.pullUpserts.map((r) => spec.toLocalRecord(r)));
  }
  if (plan.deleteLocal.length > 0) {
    await table.bulkDelete(plan.deleteLocal);
  }
  // A remote tombstone pulled down here (`deleteLocal`) previously left no
  // local trace once the row itself was gone — so `deletedAtByKey()`
  // (accountWideBackfill.ts, and `accountWide` above) only ever saw a
  // deletion this device originated itself, never one it merely learned by
  // pulling. Recording it here closes that gap for every collection, not
  // just account-wide ones: it is exactly the same fact a locally-originated
  // delete already records via `recordDeletion`, just learned a step later.
  //
  // Two distinct sources land in `deleteLocal`, with two distinct correct
  // timestamps: an ordinary remote tombstone (`r.deleted`) carries its
  // deletion time as `r.updatedAt`, but `accountWide`'s self-heal (merge.ts)
  // always pairs its `deleteLocal` push with a `pushTombstones` entry whose
  // `deletedAt` is the real deletion time — `remoteById.get(id)?.updatedAt`
  // there would be the row's pre-deletion, still-live remote copy, which is
  // stale by definition (that mismatch is exactly what triggered the
  // self-heal). `pushTombstones` is checked first for that reason.
  const remoteById = new Map(remote.map((r) => [r.id, r]));
  const pushTombstoneById = new Map(plan.pushTombstones.map((t) => [t.id, t.deletedAt]));
  const learned: LocalTombstone[] = plan.deleteLocal.flatMap((id) => {
    const deletedAt = pushTombstoneById.get(id) ?? remoteById.get(id)?.updatedAt;
    return deletedAt !== undefined ? [{ id, deletedAt }] : [];
  });
  // Pushed tombstones are now recorded remotely; resolved ones are dropped.
  const settled = new Set([...plan.clearLocalTombstones, ...plan.pushTombstones.map((t) => t.id)]);
  if (settled.size > 0 || learned.length > 0) {
    await writeTombstones(tombstonesKey, [
      ...tombstones.filter((t) => !settled.has(t.id) && !learned.some((l) => l.id === t.id)),
      ...learned,
    ]);
  }

  // Last, and only once every write above landed: a throw mid-pass must leave
  // the cursor where it was so the next pass re-reads the same window.
  await writePullCursor(pull.cursorKey, pull.next);
}
