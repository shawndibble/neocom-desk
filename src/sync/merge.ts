import { DAY_MS } from '@/lib/age';
import type {
  BuildPlanRecord,
  PlanBooster,
  PlanetRichnessRecord,
  ProductionLossRecord,
  ProductionOrderWatchRecord,
  ProductionRunRecord,
  NetWorthSnapshotRecord,
  CharacterAcceleratorRecord,
  ProductionSaleLinkRecord,
  QuickbarRecord,
  SkillPlanRecord,
  StationPinRecord,
  PayeeRecord,
  FittingRecord,
  MiningTaxAssignmentRecord,
  MiningTaxPaymentLinkRecord,
  MiningTaxRecordChangeRecord,
  WhatIfImplantSelection,
} from '@/db';
import type { Attributes, PlanMilestone } from '@/engine/types';

export const TOMBSTONE_TTL_MS = 30 * DAY_MS;

export interface SyncRecord {
  id: string;
  updatedAt: number;
}

export interface RemoteDoc extends SyncRecord {
  ownerHash: string;
  deleted?: boolean;
}

export interface RemotePlanDoc extends RemoteDoc {
  characterId: number;
  name: string;
  entries: SkillPlanRecord['entries'];
  remapCount: number;
  markers?: number[];
  markerAttributes?: (Attributes | null)[];
  whatIfImplants?: WhatIfImplantSelection;
  booster?: PlanBooster;
  boosters?: PlanBooster[];
  milestones?: PlanMilestone[];
}

export type RemoteBuildPlanDoc = BuildPlanRecord & RemoteDoc;

export type RemoteQuickbarDoc = QuickbarRecord & RemoteDoc;

export type RemoteStationPinDoc = StationPinRecord & RemoteDoc;

export type RemotePlanetRichnessDoc = PlanetRichnessRecord & RemoteDoc;

export type RemotePayeeDoc = PayeeRecord & RemoteDoc;
export type RemoteFittingDoc = FittingRecord & RemoteDoc;

export type RemoteMiningTaxAssignmentDoc = MiningTaxAssignmentRecord & RemoteDoc;

export type RemoteMiningTaxPaymentLinkDoc = MiningTaxPaymentLinkRecord & RemoteDoc;

export type RemoteMiningTaxRecordChangeDoc = MiningTaxRecordChangeRecord & RemoteDoc;

export type RemoteProductionRunDoc = ProductionRunRecord & RemoteDoc;

export type RemoteProductionSaleLinkDoc = ProductionSaleLinkRecord & RemoteDoc;

export type RemoteProductionOrderWatchDoc = ProductionOrderWatchRecord & RemoteDoc;

export type RemoteProductionLossDoc = ProductionLossRecord & RemoteDoc;

export type RemoteNetWorthSnapshotDoc = NetWorthSnapshotRecord & RemoteDoc;

export type RemoteCharacterAcceleratorDoc = CharacterAcceleratorRecord & RemoteDoc;

export interface LocalTombstone {
  id: string;
  deletedAt: number;
}

export interface MergeResult<L extends SyncRecord, R extends RemoteDoc> {
  pushUpserts: L[];
  pushTombstones: LocalTombstone[];
  pullUpserts: R[];
  deleteLocal: string[];
  purgeRemote: string[];
  clearLocalTombstones: string[];
}

export interface AccountWideTombstones<L extends SyncRecord> {
  sharedKey: (record: L) => string | undefined;
  deletedAtByKey: Map<string, number>;
}

export function mergeRecords<L extends SyncRecord, R extends RemoteDoc>(
  local: L[],
  localTombstones: LocalTombstone[],
  remote: R[],
  now: number,
  accountWide?: AccountWideTombstones<L>,
  since?: number
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
      if (l && l.updatedAt > r.updatedAt) {
        result.pushUpserts.push(l);
      } else {
        if (l) result.deleteLocal.push(id);
        if (now - r.updatedAt > TOMBSTONE_TTL_MS) result.purgeRemote.push(id);
      }
      if (t) result.clearLocalTombstones.push(id);
      continue;
    }

    if (t) {
      if (!r) {
        if (since !== undefined) result.pushTombstones.push(t);
        else result.clearLocalTombstones.push(id);
      } else if (r.updatedAt > t.deletedAt) {
        result.pullUpserts.push(r);
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
        result.deleteLocal.push(id);
        result.pushTombstones.push({ id, deletedAt });
        continue;
      }
    }

    if (l && !r) {
      if (since === undefined || l.updatedAt > since) result.pushUpserts.push(l);
    } else if (!l && r) {
      result.pullUpserts.push(r);
    } else if (l && r) {
      if (l.updatedAt > r.updatedAt) result.pushUpserts.push(l);
      else if (r.updatedAt > l.updatedAt) result.pullUpserts.push(r);
    }
  }

  return result;
}

export interface FeedRow {
  id: string;
  firedAt: number;
  dismissedAt?: number;
  fillSettledAt?: number;
}

export interface RemoteFeedDoc extends FeedRow {
  ownerHash: string;
}

export interface LocalFeedRow extends FeedRow {
  syncedAt?: number;
}

export interface FeedMergeResult<L extends FeedRow, R extends RemoteFeedDoc> {
  pushCreate: L[];
  pushDismiss: L[];
  pullCreate: R[];
  pullDismiss: R[];
  pushRedate: L[];
  pullRedate: R[];
  purgeRemote: string[];
}

export function mergeFeed<L extends LocalFeedRow, R extends RemoteFeedDoc>(
  local: readonly L[],
  pushEligible: ReadonlySet<string>,
  remote: readonly R[],
  now: number,
  windowMs: number
): FeedMergeResult<L, R> {
  const result: FeedMergeResult<L, R> = {
    pushCreate: [],
    pushDismiss: [],
    pullCreate: [],
    pullDismiss: [],
    pushRedate: [],
    pullRedate: [],
    purgeRemote: [],
  };

  const localById = new Map(local.map((r) => [r.id, r]));
  const remoteById = new Map(remote.map((r) => [r.id, r]));
  const ids = new Set([...localById.keys(), ...remoteById.keys()]);
  const purgeBefore = now - windowMs;

  for (const id of ids) {
    const l = localById.get(id);
    const r = remoteById.get(id);

    if (r && r.firedAt < purgeBefore) {
      result.purgeRemote.push(id);
      continue;
    }

    if (l && !r) {
      if (l.syncedAt !== undefined) {
        if ((l.dismissedAt ?? 0) > l.syncedAt && l.firedAt >= purgeBefore)
          result.pushCreate.push(l);
        continue;
      }
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
      } else if (l.firedAt < r.firedAt) {
        result.pushRedate.push(l);
      } else if (r.firedAt < l.firedAt) {
        result.pullRedate.push(r);
      } else if (l.fillSettledAt !== undefined && r.fillSettledAt === undefined) {
        result.pushRedate.push(l);
      } else if (r.fillSettledAt !== undefined && l.fillSettledAt === undefined) {
        result.pullRedate.push(r);
      }
    }
  }

  return result;
}

export interface SyncedSettingValue {
  key: string;
  value: unknown;
  updatedAt: number;
}

export interface SyncedSettingTombstone {
  key: string;
  deletedAt: number;
}

export interface RemoteSyncedSetting {
  key: string;
  value?: unknown;
  updatedAt: number;
  deleted?: boolean;
}

export interface SettingsMergeResult {
  push: SyncedSettingValue[];
  pull: SyncedSettingValue[];
  pushTombstones: SyncedSettingTombstone[];
  deleteLocal: string[];
  purgeRemote: string[];
  clearLocalTombstones: string[];
}

export function mergeSettings(
  local: SyncedSettingValue[],
  localTombstones: SyncedSettingTombstone[],
  remote: RemoteSyncedSetting[],
  now: number,
  since?: number
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
      if (l && l.updatedAt > r.updatedAt) {
        result.push.push(l);
      } else {
        if (l) result.deleteLocal.push(key);
        if (now - r.updatedAt > TOMBSTONE_TTL_MS) result.purgeRemote.push(key);
      }
      continue;
    }

    if (t) {
      if (r && r.updatedAt > t.deletedAt) {
        result.pull.push({ key, value: r.value, updatedAt: r.updatedAt });
        result.clearLocalTombstones.push(key);
      } else if (r || since === undefined || t.deletedAt > since) {
        result.pushTombstones.push(t);
      }
      continue;
    }

    if (l && !r) {
      if (since === undefined || (l.updatedAt > 0 && l.updatedAt > since)) result.push.push(l);
    } else if (!l && r) {
      result.pull.push({ key, value: r.value, updatedAt: r.updatedAt });
    } else if (l && r) {
      if (l.updatedAt > r.updatedAt) result.push.push(l);
      else if (r.updatedAt > l.updatedAt)
        result.pull.push({ key, value: r.value, updatedAt: r.updatedAt });
    }
  }

  return result;
}
