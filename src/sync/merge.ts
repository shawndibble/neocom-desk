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

import type { BuildPlanRecord, QuickbarRecord, SkillPlanRecord, StationPinRecord } from '@/db';

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
}

/** Remote Firestore doc at /characters/{uid}/buildPlans/{planId}. */
export type RemoteBuildPlanDoc = BuildPlanRecord & RemoteDoc;

/** Remote Firestore doc at /characters/{uid}/quickbars/{id}. */
export type RemoteQuickbarDoc = QuickbarRecord & RemoteDoc;

/** Remote Firestore doc at /characters/{uid}/stationPins/{id}. */
export type RemoteStationPinDoc = StationPinRecord & RemoteDoc;

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

export function mergeRecords<L extends SyncRecord, R extends RemoteDoc>(
  local: L[],
  localTombstones: LocalTombstone[],
  remote: R[],
  now: number
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
