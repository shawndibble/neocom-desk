// Pure merge logic for two-way sync (no firebase imports — unit-testable).
//
// Policy (CONTEXT.md): last-write-wins per record id, compared by updatedAt
// (epoch ms). Deletes propagate via tombstones: a remote doc with
// deleted: true kept for TOMBSTONE_TTL_MS (30 days), then purged.
//
// mergeRecords is generic over the record shape so the same policy covers
// every editable collection (Skill Plans, Build Plans, ...).

import type { BuildPlanRecord, SkillPlanRecord } from '@/db';

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
}

/** Remote Firestore doc at /characters/{uid}/buildPlans/{planId}. */
export type RemoteBuildPlanDoc = BuildPlanRecord & RemoteDoc;

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

export interface SettingsMergeResult {
  push: SyncedSettingValue[];
  pull: SyncedSettingValue[];
}

/** Last-write-wins per settings key. No tombstones: keys are a stable set. */
export function mergeSettings(
  local: SyncedSettingValue[],
  remote: SyncedSettingValue[]
): SettingsMergeResult {
  const result: SettingsMergeResult = { push: [], pull: [] };
  const remoteByKey = new Map(remote.map((s) => [s.key, s]));
  const localKeys = new Set(local.map((s) => s.key));

  for (const l of local) {
    const r = remoteByKey.get(l.key);
    if (!r || l.updatedAt > r.updatedAt) result.push.push(l);
    else if (r.updatedAt > l.updatedAt) result.pull.push(r);
  }
  for (const r of remote) {
    if (!localKeys.has(r.key)) result.pull.push(r);
  }
  return result;
}
