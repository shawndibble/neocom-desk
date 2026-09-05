// Pure merge logic for two-way sync (no firebase imports — unit-testable).
//
// Policy (CONTEXT.md): last-write-wins by updatedAt (epoch ms). Deletes
// propagate via tombstones: a remote doc with deleted: true is kept for
// TOMBSTONE_TTL_MS (30 days), then purged.
//
// Two entry points, because the two collection shapes diverge on delete policy:
//   mergeRecords  — keyed by record id; generic over the record shape, covers
//                   Skill Plans and Build Plans. Local tombstones expire on the
//                   30-day TTL.
//   mergeSettings — keyed by setting key; local tombstones never expire (only a
//                   newer write to the key supersedes them). See issue #13.

import type {
  BuildPlanRecord,
  PlanBooster,
  QuickbarRecord,
  SkillPlanRecord,
  StationPinRecord,
  PlanetRichnessRecord,
  PayeeRecord,
  MiningTaxAssignmentRecord,
  WhatIfImplantSelection,
} from '@/db';
import type { Attributes } from '@/engine/types';

export const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Minimum shape a locally stored syncable record must have. */
export interface SyncRecord {
  id: string;
  /** Epoch ms of last edit. */
  updatedAt: number;
}

/** Minimum shape of a remote Firestore doc in an editable collection. */
export interface RemoteDoc extends SyncRecord {
  /** Owner hash the doc was written under; checked by Firestore rules. */
  ownerHash: string;
  deleted?: boolean;
}

/** Remote Firestore doc at /characters/{uid}/plans/{planId}. */
export interface RemotePlanDoc extends RemoteDoc {
  characterId: number;
  name: string;
  entries: SkillPlanRecord['entries'];
  remapCount: number;
  markers?: number[];
  markerAttributes?: (Attributes | null)[];
  whatIfImplants?: WhatIfImplantSelection;
  booster?: PlanBooster;
}

/** Remote Firestore doc at /characters/{uid}/buildPlans/{planId}. */
export type RemoteBuildPlanDoc = BuildPlanRecord & RemoteDoc;

/** Remote Firestore doc at /characters/{uid}/quickbars/{id}. */
export type RemoteQuickbarDoc = QuickbarRecord & RemoteDoc;

/** Remote Firestore doc at /characters/{uid}/stationPins/{id}. */
export type RemoteStationPinDoc = StationPinRecord & RemoteDoc;

/** Remote Firestore doc at /characters/{uid}/planetRichness/{id} (issue #425). */
export type RemotePlanetRichnessDoc = PlanetRichnessRecord & RemoteDoc;

/** Remote Firestore doc at /characters/{uid}/payees/{id} (issue #523). */
export type RemotePayeeDoc = PayeeRecord & RemoteDoc;

/** Remote Firestore doc at /characters/{uid}/miningTaxAssignments/{id} (issue #523). */
export type RemoteMiningTaxAssignmentDoc = MiningTaxAssignmentRecord & RemoteDoc;

/** Locally recorded deletion awaiting propagation to the remote store. */
export interface LocalTombstone {
  id: string;
  /** Epoch ms when the user deleted the record on this device. */
  deletedAt: number;
}

export interface MergeResult<L extends SyncRecord, R extends RemoteDoc> {
  /** Local records to write (create/overwrite) remotely. */
  pushUpserts: L[];
  /** Local deletions to write remotely as deleted: true docs. */
  pushTombstones: LocalTombstone[];
  /** Remote records to write into the local store. */
  pullUpserts: R[];
  /** Local record ids to delete (remote tombstone won). */
  deleteLocal: string[];
  /** Remote tombstone doc ids past TTL, to delete remotely. */
  purgeRemote: string[];
  /** Local tombstone ids that are resolved and can be dropped. */
  clearLocalTombstones: string[];
}

/**
 * A second, shared-key deletion signal for account-wide collections (issue
 * #436), layered on top of `LocalTombstone`'s per-id one.
 *
 * `accountWideBackfill.ts`'s `cloneOnto` re-keys a row onto a Character added
 * after the delete, preserving the source row's own `updatedAt` — an id no
 * per-id tombstone names. Without this, `mergeRecords` sees a plain new local
 * row (`l && !r`, or `l && r` already in sync) and pushes or leaves it,
 * permanently resurrecting the deletion. `deletedAtByKey` is keyed by
 * whatever `sharedKey` returns rather than by record id, so it recognizes the
 * deletion regardless of which id the row was copied onto.
 */
export interface AccountWideTombstones<L extends SyncRecord> {
  /**
   * What makes two records the same piece of account state, ignoring which
   * Character holds them (mirrors `AccountWideCollection.sharedKey` in
   * accountWideBackfill.ts). Returning `undefined` opts a record out — e.g. a
   * Station Pin's `character`-scoped rows share their `locationId` with any
   * `account`-scoped one at the same station, and must not be caught by a
   * deletion that only ever applied to the account-wide row.
   */
  sharedKey: (record: L) => string | undefined;
  /** The latest recorded deletion time for each shared key, from `deletedAtByKey()`. */
  deletedAtByKey: Map<string, number>;
}

export function mergeRecords<L extends SyncRecord, R extends RemoteDoc>(
  local: L[],
  localTombstones: LocalTombstone[],
  remote: R[],
  now: number,
  accountWide?: AccountWideTombstones<L>
): MergeResult<L, R> {
  const result: MergeResult<L, R> = {
    pushUpserts: [],
    pushTombstones: [],
    pullUpserts: [],
    deleteLocal: [],
    purgeRemote: [],
    clearLocalTombstones: [],
  };

  const localById = new Map(local.map((p) => [p.id, p]));
  const remoteById = new Map(remote.map((d) => [d.id, d]));

  // A live local row supersedes its own tombstone; expired tombstones are
  // ignored (deletion is too old to matter — a surviving remote copy wins).
  const tombstoneById = new Map<string, LocalTombstone>();
  for (const t of localTombstones) {
    if (localById.has(t.id) || now - t.deletedAt > TOMBSTONE_TTL_MS) {
      result.clearLocalTombstones.push(t.id);
    } else {
      tombstoneById.set(t.id, t);
    }
  }

  const ids = new Set([...localById.keys(), ...remoteById.keys(), ...tombstoneById.keys()]);

  for (const id of ids) {
    const l = localById.get(id);
    const r = remoteById.get(id);
    const t = tombstoneById.get(id);

    if (r?.deleted) {
      // Remote tombstone.
      if (l && l.updatedAt > r.updatedAt) {
        result.pushUpserts.push(l); // edited after the delete: resurrect
      } else {
        if (l) result.deleteLocal.push(id);
        if (now - r.updatedAt > TOMBSTONE_TTL_MS) result.purgeRemote.push(id);
      }
      if (t) result.clearLocalTombstones.push(id); // remote already records it
      continue;
    }

    if (t) {
      // Local pending deletion (no local row — guaranteed above).
      if (!r) {
        result.clearLocalTombstones.push(id); // nothing remote to delete
      } else if (r.updatedAt > t.deletedAt) {
        result.pullUpserts.push(r); // edited elsewhere after the delete
        result.clearLocalTombstones.push(id);
      } else {
        result.pushTombstones.push(t);
      }
      continue;
    }

    if (l && accountWide) {
      const key = accountWide.sharedKey(l);
      const deletedAt = key === undefined ? undefined : accountWide.deletedAtByKey.get(key);
      if (deletedAt !== undefined && deletedAt > l.updatedAt) {
        // Some Character known locally has recorded (or learned) a deletion
        // of this shared state after this row was last edited — whether `r`
        // is absent (a fresh clone, #436) or already equal to `l` (a clone
        // pushed before that signal existed). Either way it is stale: drop
        // it locally and assert the deletion under its own id, exactly like
        // an ordinary local tombstone above.
        result.deleteLocal.push(id);
        result.pushTombstones.push({ id, deletedAt });
        continue;
      }
    }

    if (l && !r) {
      result.pushUpserts.push(l);
    } else if (!l && r) {
      result.pullUpserts.push(r);
    } else if (l && r) {
      if (l.updatedAt > r.updatedAt) result.pushUpserts.push(l);
      else if (r.updatedAt > l.updatedAt) result.pullUpserts.push(r);
      // equal: in sync, nothing to do
    }
  }

  return result;
}

/** Minimum shape of a local Notification Feed row needed to merge it (issue #362). */
export interface FeedRow {
  /** The Occurrence Key (issue #348) — never a minted id, so a push/pull can never duplicate a row. */
  id: string;
  /** Epoch ms the poller (or the backend) fired this. */
  firedAt: number;
  /** Epoch ms dismissed, absent while live. */
  dismissedAt?: number;
}

/** Remote Firestore doc at /characters/{uid}/notificationFeed/{id}. */
export interface RemoteFeedDoc extends FeedRow {
  ownerHash: string;
}

export interface FeedMergeResult<L extends FeedRow, R extends RemoteFeedDoc> {
  /** Local rows to create remotely — never seen there yet, and within the sync window. */
  pushCreate: L[];
  /** Local rows whose dismissal is newer than the remote copy — push the flag. */
  pushDismiss: L[];
  /** Remote rows to create locally — never seen here yet. */
  pullCreate: R[];
  /** Remote rows whose dismissal is newer than the local copy — pull the flag. */
  pullDismiss: R[];
}

/**
 * Feed sync has no tombstones (CONTEXT.md round 45: dismissal is a flag, this
 * collection never deletes) and no generic LWW over a whole record — content
 * fields never change once a row is fired, only `dismissedAt` does. So unlike
 * {@link mergeRecords}, this keys strictly on `firedAt`/`dismissedAt`:
 * `dismissedAt` is the one field that reconciles LWW-style (higher wins,
 * absent treated as 0/never), the same shape as `mergeRecords`' `updatedAt`
 * policy but scoped to that single field.
 *
 * `pushEligible` gates push-CREATE only — CONTEXT.md's synced window (30 days
 * or 100 rows, whichever is smaller; see `rowsWithinSyncWindow` in
 * `features/notifications/feed.ts`) bounds which *new* rows a device starts
 * uploading, not what it will accept, and not corrections to a row the
 * remote side already has. A dismissal on a row that has since aged out of
 * the push window must still push once the remote side already knows about
 * that row (it got there via an earlier push, a pull, or the backend) — the
 * window only decides whether a row is introduced to sync at all, not
 * whether an already-shared row's `dismissedAt` can be corrected. So
 * push-DISMISS is unconditional whenever both sides have the row, exactly
 * like the PULL direction, which always compares against every local row
 * passed in, never just the windowed subset, and never regresses an
 * already-recorded dismissal.
 */
export function mergeFeed<L extends FeedRow, R extends RemoteFeedDoc>(
  local: readonly L[],
  pushEligible: ReadonlySet<string>,
  remote: readonly R[]
): FeedMergeResult<L, R> {
  const result: FeedMergeResult<L, R> = {
    pushCreate: [],
    pushDismiss: [],
    pullCreate: [],
    pullDismiss: [],
  };

  const localById = new Map(local.map((r) => [r.id, r]));
  const remoteById = new Map(remote.map((r) => [r.id, r]));
  const ids = new Set([...localById.keys(), ...remoteById.keys()]);

  for (const id of ids) {
    const l = localById.get(id);
    const r = remoteById.get(id);

    if (l && !r) {
      if (pushEligible.has(id)) result.pushCreate.push(l);
      continue;
    }
    if (!l && r) {
      result.pullCreate.push(r);
      continue;
    }
    if (l && r) {
      const localDismissed = l.dismissedAt ?? 0;
      const remoteDismissed = r.dismissedAt ?? 0;
      if (localDismissed > remoteDismissed) {
        result.pushDismiss.push(l);
      } else if (remoteDismissed > localDismissed) {
        result.pullDismiss.push(r);
      }
    }
  }

  return result;
}

/** A synced setting with its last-write timestamp (epoch ms). */
export interface SyncedSettingValue {
  key: string;
  value: unknown;
  updatedAt: number;
}

/**
 * A synced setting deleted on this device, awaiting propagation. Unlike a
 * Skill Plan {@link LocalTombstone}, this one is NOT time-limited: it persists
 * until the key is written again (see mergeSettings). A newer write to the key
 * supersedes it; nothing else does.
 */
export interface SyncedSettingTombstone {
  key: string;
  /** Epoch ms when the user deleted the setting on this device. */
  deletedAt: number;
}

/** Remote Firestore doc at /characters/{uid}/settings/{key}. */
export interface RemoteSyncedSetting {
  key: string;
  /** Absent on a tombstone doc (Firestore rejects undefined field values). */
  value?: unknown;
  updatedAt: number;
  deleted?: boolean;
}

export interface SettingsMergeResult {
  /** Local values to write (create/overwrite) remotely as live docs. */
  push: SyncedSettingValue[];
  /** Remote values to write into the local store. */
  pull: SyncedSettingValue[];
  /** Local deletions to write remotely as deleted: true docs. */
  pushTombstones: SyncedSettingTombstone[];
  /** Local setting keys to delete (remote tombstone won). */
  deleteLocal: string[];
  /** Remote tombstone doc keys past TTL, to delete remotely. */
  purgeRemote: string[];
  /**
   * Local tombstone keys superseded by a remote write postdating the delete.
   * NOT populated just because a tombstone was pushed, or because the remote
   * already carries its own tombstone — see mergeSettings for why.
   */
  clearLocalTombstones: string[];
}

/**
 * Last-write-wins per settings key, with tombstones for deletes so a setting
 * deleted on one device stays deleted everywhere (issue #13).
 *
 * The remote tombstone expires on the shared 30-day {@link TOMBSTONE_TTL_MS}
 * policy. The local tombstone deliberately does NOT expire — it is superseded
 * only by a newer write to that key. Known accepted edge (the same one Skill
 * Plans carry): a device offline past the remote 30-day window never observes
 * the delete, and once the remote tombstone is purged it re-pushes its stale
 * copy on the next sync.
 */
export function mergeSettings(
  local: SyncedSettingValue[],
  localTombstones: SyncedSettingTombstone[],
  remote: RemoteSyncedSetting[],
  now: number
): SettingsMergeResult {
  const result: SettingsMergeResult = {
    push: [],
    pull: [],
    pushTombstones: [],
    deleteLocal: [],
    purgeRemote: [],
    clearLocalTombstones: [],
  };

  const localByKey = new Map(local.map((s) => [s.key, s]));
  const remoteByKey = new Map(remote.map((s) => [s.key, s]));

  // A live local write supersedes its own pending deletion. Otherwise the
  // tombstone survives this cycle untouched: it is cleared ONLY when a remote
  // write postdates the delete (see the `if (t)` branch below) — never merely
  // because it was just pushed, or because the remote already carries its own
  // tombstone, or because remote has nothing for the key. The remote
  // tombstone is only good for TOMBSTONE_TTL_MS; once purged, this local
  // tombstone is the sole defense against a stale device re-pushing its
  // pre-deletion copy. No TTL branch: an un-superseded local tombstone lives
  // forever.
  const tombstoneByKey = new Map<string, SyncedSettingTombstone>();
  for (const t of localTombstones) {
    if (localByKey.has(t.key)) result.clearLocalTombstones.push(t.key);
    else tombstoneByKey.set(t.key, t);
  }

  const keys = new Set([...localByKey.keys(), ...remoteByKey.keys(), ...tombstoneByKey.keys()]);

  for (const key of keys) {
    const l = localByKey.get(key);
    const r = remoteByKey.get(key);
    const t = tombstoneByKey.get(key);

    if (r?.deleted) {
      // Remote tombstone.
      if (l && l.updatedAt > r.updatedAt) {
        result.push.push(l); // rewritten locally after the delete: resurrect
      } else {
        if (l) result.deleteLocal.push(key);
        if (now - r.updatedAt > TOMBSTONE_TTL_MS) result.purgeRemote.push(key);
      }
      continue;
    }

    if (t) {
      // Local pending deletion (no live local row — guaranteed above).
      if (r && r.updatedAt > t.deletedAt) {
        result.pull.push({ key, value: r.value, updatedAt: r.updatedAt });
        result.clearLocalTombstones.push(key); // edited elsewhere after the delete
      } else {
        result.pushTombstones.push(t); // reassert: remote has nothing, or is stale
      }
      continue;
    }

    if (l && !r) {
      result.push.push(l);
    } else if (!l && r) {
      result.pull.push({ key, value: r.value, updatedAt: r.updatedAt });
    } else if (l && r) {
      if (l.updatedAt > r.updatedAt) result.push.push(l);
      else if (r.updatedAt > l.updatedAt)
        result.pull.push({ key, value: r.value, updatedAt: r.updatedAt });
      // equal: in sync, nothing to do
    }
  }

  return result;
}
