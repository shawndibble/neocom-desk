// Per-collection two-way sync passes (pull, merge, push) for one character:
// every editable collection, the Notification Feed and synced settings.
// planSync.ts owns the driver (syncCharacter) and the mutation API and calls
// these; this module never imports it back.
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
import {
  db,
  type NotificationFeedRecord,
  type PlanetRichnessRecord,
  type StationPinRecord,
} from '@/db';
import { planetRichnessDeletedAtByKey, stationPinDeletedAtByKey } from './accountWideBackfill';
import {
  FEED_SYNC_WINDOW_MS,
  mergeFeedRecord,
  rowsWithinSyncWindow,
  trimFeed,
} from '@/features/notifications/feed';
import { refreshAppBadge } from '@/features/notifications/appBadge';
import { mapWithConcurrencyLimit } from '@/lib/concurrency';
import {
  INTERNAL_PREFIX,
  readTombstones,
  tombstoneKey,
  pullCursorKey,
  readPullCursor,
  writePullCursor,
  type PullCursor,
} from './localBookkeeping';
import {
  mergeFeed,
  mergeRecords,
  mergeSettings,
  TOMBSTONE_TTL_MS,
  type LocalTombstone,
  type RemoteDoc,
  type RemoteFeedDoc,
  type RemoteSyncedSetting,
  type SyncedSettingTombstone,
  type SyncedSettingValue,
} from './merge';
import {
  NOTIFICATION_FEED,
  PLANET_RICHNESS,
  STATION_PINS,
  SYNCED_SETTINGS,
  type EditableCollection,
  type EditableRecord,
} from './syncedCollections';

// ---------------------------------------------------------------------------
// Local bookkeeping (Dexie settings table). 'sync.__' keys are internal and

// ---------------------------------------------------------------------------
// Local bookkeeping (Dexie settings table). 'sync.__' keys are internal and
// never synced; 'sync.' keys are the user settings that DO sync.
// ---------------------------------------------------------------------------

export const SYNCED_PREFIX = 'sync.';
// Key builders (ownerHashKey, tombstoneKey) live in localBookkeeping.ts,
// Firebase-free, so features/character/removeCharacter.ts can clear them
// without pulling in Firebase.
export const SETTINGS_META_KEY = `${INTERNAL_PREFIX}settingsMeta`;
// Synced settings are a single global set (not per-character, like plans), so
// their tombstones live under one global key too — a delete recorded during
// one character's sync must be visible on every other character's pass.
export const SETTINGS_TOMBSTONES_KEY = `${INTERNAL_PREFIX}settingsTombstones`;

export function isSyncedSettingKey(key: string): boolean {
  return key.startsWith(SYNCED_PREFIX) && !key.startsWith(INTERNAL_PREFIX);
}

export async function readSettingsMeta(): Promise<Record<string, number>> {
  const record = await db.settings.get(SETTINGS_META_KEY);
  return record && typeof record.value === 'object' && record.value !== null
    ? { ...(record.value as Record<string, number>) }
    : {};
}

export async function writeSettingsMeta(meta: Record<string, number>): Promise<void> {
  await db.settings.put({ key: SETTINGS_META_KEY, value: meta });
}

export async function readSettingsTombstones(): Promise<SyncedSettingTombstone[]> {
  const record = await db.settings.get(SETTINGS_TOMBSTONES_KEY);
  return Array.isArray(record?.value) ? (record.value as SyncedSettingTombstone[]) : [];
}

export async function writeSettingsTombstones(tombstones: SyncedSettingTombstone[]): Promise<void> {
  await db.settings.put({ key: SETTINGS_TOMBSTONES_KEY, value: tombstones });
}

const PUSH_CONCURRENCY = 20;

async function runBounded(writes: (() => Promise<unknown>)[]): Promise<void> {
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
// The synced *settings* collection deliberately stays a full read: its
// tombstones never expire and `mergeSettings`' absence semantics differ, and
// it is the cheapest of the 12 (bounded by the synced-key allow-list).
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
 * Firestore refuses a composite query whose index is not deployed yet with
 * `failed-precondition`. `firestore.indexes.json` is deployed by hand, so a
 * client running this code before that lands must not simply stop syncing:
 * the pass degrades to the unfiltered read it used to do, and records itself
 * as a full read so nothing is missed.
 */
function isMissingIndex(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === 'failed-precondition';
}

async function pullOwnedDocs<R extends { ownerHash: string; updatedAt?: number }>(
  col: CollectionReference,
  ctx: SyncContext,
  collectionName: string
): Promise<PullWindow<R>> {
  const cursorKey = pullCursorKey(ctx.characterId, collectionName);
  const cursor = await readPullCursor(cursorKey);
  // No cursor at all = an in-place upgrade, or a fresh device: full read, so
  // pre-existing remote docs can never be missed.
  const fresh = cursor !== undefined && ctx.now - cursor.fullAt <= FULL_RECONCILE_INTERVAL_MS;
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
  await runBounded([
    ...pushed.map(
      (row) => () => setDoc(doc(col, row.id), toRemoteFeedDoc(row, ctx.ownerHash, writeNow))
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

// ---------------------------------------------------------------------------
// Synced settings
// ---------------------------------------------------------------------------

export async function syncSettings(ctx: SyncContext): Promise<void> {
  const { firestore, uid, ownerHash, now } = ctx;
  // The second `ownerHash` read, and under the same index constraint as
  // `fetchOwnedDocs` — see its docstring. Deliberately unwindowed: settings
  // tombstones never expire and `mergeSettings`' absence semantics differ.
  const settingsCol = collection(firestore, 'characters', uid, SYNCED_SETTINGS.remoteName);
  const snapshot = await getDocs(query(settingsCol, where('ownerHash', '==', ownerHash)));
  // Only honour well-formed synced keys: a hostile or stale doc naming a
  // non-synced Dexie key ('activeCharacterId') or an internal 'sync.__' key
  // must never reach Dexie.
  const remoteSettings = snapshot.docs
    .map((d) => d.data() as RemoteSyncedSetting)
    .filter((s) => typeof s.key === 'string' && isSyncedSettingKey(s.key));
  const meta = await readSettingsMeta();
  const settingsTombstones = await readSettingsTombstones();
  const localSettings: SyncedSettingValue[] = (await db.settings.toArray())
    .filter((record) => isSyncedSettingKey(record.key))
    .map((record) => ({ key: record.key, value: record.value, updatedAt: meta[record.key] ?? 0 }));

  const settings = mergeSettings(localSettings, settingsTombstones, remoteSettings, now);
  /** LWW stamps this pass wants to record, applied under the transaction below. */
  const stamps = new Map<string, number>();

  await Promise.all([
    ...settings.push.map((s) => {
      // A key written outside setSyncedSetting has no timestamp yet: stamp now.
      const updatedAt = s.updatedAt > 0 ? s.updatedAt : now;
      if (meta[s.key] !== updatedAt) stamps.set(s.key, updatedAt);
      return setDoc(doc(settingsCol, s.key), {
        key: s.key,
        value: s.value,
        updatedAt,
        ownerHash,
        deleted: false,
      });
    }),
    ...settings.pushTombstones.map((t) =>
      // No `value` field — Firestore rejects undefined, and a tombstone carries none.
      setDoc(doc(settingsCol, t.key), {
        key: t.key,
        updatedAt: t.deletedAt,
        ownerHash,
        deleted: true,
      })
    ),
    ...settings.purgeRemote.map((key) => deleteDoc(doc(settingsCol, key))),
  ]);

  // One transaction for the whole pull rather than a put/delete per key: the
  // rows and their LWW stamps land together, and a live query over settings
  // re-runs once instead of once per row. Dexie only inside it — an awaited
  // Firestore call would let the transaction auto-commit early.
  //
  // The meta is re-read inside it: the merge above worked from a snapshot
  // taken before the network round trips, and a setSyncedSetting /
  // deleteSyncedSetting landing in between must neither be overwritten by the
  // pull nor lose its stamp. A key whose stamp moved since the snapshot is
  // left alone; the next pass merges it properly.
  if (settings.pull.length > 0 || settings.deleteLocal.length > 0 || stamps.size > 0) {
    await db.transaction('rw', db.settings, async () => {
      const current = await readSettingsMeta();
      const untouched = (key: string) => current[key] === meta[key];
      const pull = settings.pull.filter((s) => untouched(s.key));
      const deleteLocal = settings.deleteLocal.filter(untouched);
      let dirty = false;
      for (const [key, updatedAt] of stamps) {
        if (!untouched(key)) continue;
        current[key] = updatedAt;
        dirty = true;
      }
      for (const s of pull) {
        current[s.key] = s.updatedAt;
        dirty = true;
      }
      for (const key of deleteLocal) {
        if (key in current) {
          delete current[key];
          dirty = true;
        }
      }
      if (pull.length > 0) {
        await db.settings.bulkPut(pull.map((s) => ({ key: s.key, value: s.value })));
      }
      if (deleteLocal.length > 0) await db.settings.bulkDelete(deleteLocal);
      if (dirty) await writeSettingsMeta(current);
    });
  }

  // Do NOT also clear on settings.pushTombstones: a tombstone that was just
  // pushed is not yet resolved — see mergeSettings for why it must survive
  // until a remote write postdates the delete.
  if (settings.clearLocalTombstones.length > 0) {
    const cleared = new Set(settings.clearLocalTombstones);
    await writeSettingsTombstones(settingsTombstones.filter((t) => !cleared.has(t.key)));
  }
}
