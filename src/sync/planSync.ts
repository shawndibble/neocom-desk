// Two-way sync of Skill Plans, Build Plans, the Quickbar + synced settings for
// one character. Public API and UI wiring live in index.ts.
//
// Remote layout: /characters/char:{id}/{plans,buildPlans,quickbars,settings}.
// Merge policy is pure and lives in merge.ts: last-write-wins per record id,
// tombstones for deletes kept 30 days.
//
// Syncs are serialized GLOBALLY, not just per character: the Firebase session is
// a single slot swapped by ensureSignedIn, so two concurrent syncs would race
// the auth state mid-flight. Status is tracked per character so a later
// character's success cannot mask an earlier one's failure.
//
// Owner-hash safety, so a previous owner's data neither leaks in nor gets
// pushed up: reads filter on the current hash, and Firestore rules deny
// single-doc reads whose ownerHash doesn't match the auth token's claim.

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
  type BuildPlanRecord,
  type CharacterRecord,
  type QuickbarRecord,
  type SkillPlanRecord,
} from '@/db';
import { purgeCharacterCacheOrSuppress } from '@/esi/cachePurge';
import { getSyncFirestore } from './firebaseApp';
import { setStatus } from './status';
import { ensureSignedIn } from './syncAuth';
import {
  mergeRecords,
  mergeSettings,
  type LocalTombstone,
  type RemoteBuildPlanDoc,
  type RemoteDoc,
  type RemotePlanDoc,
  type RemoteQuickbarDoc,
  type RemoteSyncedSetting,
  type SyncedSettingTombstone,
  type SyncedSettingValue,
  type SyncRecord,
} from './merge';
import { isAllowedSyncedSettingKey } from './syncedSettings';

// ---------------------------------------------------------------------------
// Local bookkeeping (Dexie settings table). 'sync.__' keys are internal and
// never synced; 'sync.' keys are the user settings that DO sync.
// ---------------------------------------------------------------------------

const SYNCED_PREFIX = 'sync.';
const INTERNAL_PREFIX = 'sync.__';
const planTombstonesKey = (characterId: number) => `${INTERNAL_PREFIX}tombstones.${characterId}`;
const buildPlanTombstonesKey = (characterId: number) =>
  `${INTERNAL_PREFIX}buildTombstones.${characterId}`;
// The Quickbar is one record per character, never deleted (only emptied), so
// this stays empty in practice — kept for symmetry with syncEditableCollection,
// which needs a tombstone key for every CollectionSpec.
const quickbarTombstonesKey = (characterId: number) =>
  `${INTERNAL_PREFIX}quickbarTombstones.${characterId}`;
const ownerHashKey = (characterId: number) => `${INTERNAL_PREFIX}ownerHash.${characterId}`;
const SETTINGS_META_KEY = `${INTERNAL_PREFIX}settingsMeta`;
// Synced settings are a single global set (not per-character, like plans), so
// their tombstones live under one global key too — a delete recorded during
// one character's sync must be visible on every other character's pass.
const SETTINGS_TOMBSTONES_KEY = `${INTERNAL_PREFIX}settingsTombstones`;

function isSyncedSettingKey(key: string): boolean {
  return key.startsWith(SYNCED_PREFIX) && !key.startsWith(INTERNAL_PREFIX);
}

async function readTombstones(key: string): Promise<LocalTombstone[]> {
  const record = await db.settings.get(key);
  return Array.isArray(record?.value) ? (record.value as LocalTombstone[]) : [];
}

async function writeTombstones(key: string, tombstones: LocalTombstone[]): Promise<void> {
  await db.settings.put({ key, value: tombstones });
}

async function readSettingsMeta(): Promise<Record<string, number>> {
  const record = await db.settings.get(SETTINGS_META_KEY);
  return record && typeof record.value === 'object' && record.value !== null
    ? { ...(record.value as Record<string, number>) }
    : {};
}

async function writeSettingsMeta(meta: Record<string, number>): Promise<void> {
  await db.settings.put({ key: SETTINGS_META_KEY, value: meta });
}

async function readSettingsTombstones(): Promise<SyncedSettingTombstone[]> {
  const record = await db.settings.get(SETTINGS_TOMBSTONES_KEY);
  return Array.isArray(record?.value) ? (record.value as SyncedSettingTombstone[]) : [];
}

async function writeSettingsTombstones(tombstones: SyncedSettingTombstone[]): Promise<void> {
  await db.settings.put({ key: SETTINGS_TOMBSTONES_KEY, value: tombstones });
}

// ---------------------------------------------------------------------------
// Sync status. Re-exported so the driver stays a single import site; the store
// itself is in status.ts (Firebase-free, so the UI can subscribe without this).
// ---------------------------------------------------------------------------

export { getSyncStatus, subscribeSyncStatus, type SyncState, type SyncStatus } from './status';

// ---------------------------------------------------------------------------
// Mutation helpers the UI layer should use
// ---------------------------------------------------------------------------

async function recordDeletion(
  characterId: number,
  id: string,
  tombstoneKey: string,
  deleteRow: () => Promise<void>
): Promise<void> {
  await deleteRow();
  const tombstones = (await readTombstones(tombstoneKey)).filter((t) => t.id !== id);
  tombstones.push({ id, deletedAt: Date.now() });
  await writeTombstones(tombstoneKey, tombstones);
  scheduleSync(characterId);
}

/** Delete a Skill Plan locally + tombstone, so the deletion propagates. */
export async function markPlanDeleted(characterId: number, planId: string): Promise<void> {
  await recordDeletion(characterId, planId, planTombstonesKey(characterId), () =>
    db.skillPlans.delete(planId)
  );
}

/** Build Plan analogue of markPlanDeleted — same tombstone semantics. */
export async function markBuildPlanDeleted(characterId: number, planId: string): Promise<void> {
  await recordDeletion(characterId, planId, buildPlanTombstonesKey(characterId), () =>
    db.buildPlans.delete(planId)
  );
}

/** Write a synced setting ('sync.'-prefixed key) and stamp it for LWW merging. */
export async function setSyncedSetting(key: string, value: unknown): Promise<void> {
  if (!isSyncedSettingKey(key)) {
    throw new Error(`Synced settings keys must start with '${SYNCED_PREFIX}' (got '${key}')`);
  }
  if (!isAllowedSyncedSettingKey(key)) {
    throw new Error(
      `'${key}' is not on the synced-settings allow-list. Add it to SYNCED_SETTING_KEYS ` +
        `in src/sync/syncedSettings.ts (and its pinned test), and delete it via ` +
        `deleteSyncedSetting so the tombstone path applies.`
    );
  }
  await db.settings.put({ key, value });
  const meta = await readSettingsMeta();
  meta[key] = Date.now();
  await writeSettingsMeta(meta);
}

/**
 * Delete a synced setting locally and record a tombstone so the deletion
 * propagates to other devices on the next sync. Always use this instead of a
 * plain Dexie delete, or the setting resurrects from the remote copy.
 *
 * Deliberately does NOT check the allow-list — a key removed from
 * SYNCED_SETTING_KEYS must still be deletable. Like setSyncedSetting it leaves
 * scheduling to the caller (pair it with scheduleSync(characterId)).
 */
export async function deleteSyncedSetting(key: string): Promise<void> {
  if (!isSyncedSettingKey(key)) {
    throw new Error(`Synced settings keys must start with '${SYNCED_PREFIX}' (got '${key}')`);
  }
  await db.settings.delete(key);
  const meta = await readSettingsMeta();
  if (key in meta) {
    delete meta[key];
    await writeSettingsMeta(meta);
  }
  const tombstones = (await readSettingsTombstones()).filter((t) => t.key !== key);
  tombstones.push({ key, deletedAt: Date.now() });
  await writeSettingsTombstones(tombstones);
}

// ---------------------------------------------------------------------------
// Sync driver
// ---------------------------------------------------------------------------

const running = new Map<number, Promise<void>>();
const pendingTimers = new Map<number, ReturnType<typeof setTimeout>>();
const DEFAULT_DEBOUNCE_MS = 2000;
// Global serialization chain. Never left rejected: failures surface through the
// per-run promise and the status stream.
let syncChain: Promise<void> = Promise.resolve();

/** Debounced sync — call after each edit. */
export function scheduleSync(characterId: number, debounceMs = DEFAULT_DEBOUNCE_MS): void {
  const existing = pendingTimers.get(characterId);
  if (existing !== undefined) clearTimeout(existing);
  pendingTimers.set(
    characterId,
    setTimeout(() => {
      pendingTimers.delete(characterId);
      triggerSync(characterId).catch(() => {
        // Failure already surfaced via subscribeSyncStatus.
      });
    }, debounceMs)
  );
}

/**
 * Run a sync now. Coalesced per character (an already-running sync for it is
 * awaited instead) and serialized globally.
 */
export function triggerSync(characterId: number): Promise<void> {
  const pending = pendingTimers.get(characterId);
  if (pending !== undefined) {
    clearTimeout(pending);
    pendingTimers.delete(characterId);
  }
  const active = running.get(characterId);
  if (active) return active;

  const run = syncChain.then(async () => {
    setStatus(characterId, { state: 'syncing', error: null });
    try {
      await syncCharacter(characterId);
      setStatus(characterId, { state: 'idle', lastSyncedAt: Date.now(), error: null });
    } catch (error) {
      setStatus(characterId, {
        state: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      running.delete(characterId);
    }
  });
  syncChain = run.catch(() => {
    // Keep the chain alive; the failure is reported via `run` and the status.
  });
  running.set(characterId, run);
  return run;
}

/**
 * EVE changes a character's ownerHash when it is sold or transferred. If it
 * changed since our last sync, the local editable data belongs to the previous
 * owner — wipe it, its tombstones and its cached ESI responses.
 */
async function handleOwnerHashChange(character: CharacterRecord): Promise<void> {
  const key = ownerHashKey(character.characterId);
  const stored = await db.settings.get(key);
  if (stored !== undefined && stored.value !== character.ownerHash) {
    await db.skillPlans.where('characterId').equals(character.characterId).delete();
    await db.buildPlans.where('characterId').equals(character.characterId).delete();
    await db.quickbars.where('characterId').equals(character.characterId).delete();
    await writeTombstones(planTombstonesKey(character.characterId), []);
    await writeTombstones(buildPlanTombstonesKey(character.characterId), []);
    await writeTombstones(quickbarTombstonesKey(character.characterId), []);
    // Cached wallet/mail/assets belong to the previous owner just as much as
    // the plans do. `auth/session` purges on the same signal at login; this
    // covers a transfer noticed between logins. Degrades rather than throws
    // (esi/cachePurge.ts) — a failing purge must not fail the sync.
    const outcome = await purgeCharacterCacheOrSuppress(character.characterId);
    // 'suppressed' = both purge tiers failed, rows still on disk. Suppression
    // can be memory-only, so advancing the bookmark would burn the last retry:
    // after a reload the marker is gone, the hash matches and the previous
    // owner's data reads normally. Leaving it makes the next sync re-detect;
    // the plan deletes above are idempotent.
    if (outcome === 'suppressed') return;
  }
  await db.settings.put({ key, value: character.ownerHash });
}

// ---------------------------------------------------------------------------
// Generic editable-collection sync (Skill Plans, Build Plans)
// ---------------------------------------------------------------------------

interface CollectionSpec<L extends SyncRecord, R extends RemoteDoc> {
  /** Firestore subcollection name under /characters/{uid}. */
  name: string;
  tombstoneKey: (characterId: number) => string;
  loadLocal: (characterId: number) => Promise<L[]>;
  /** Full remote doc payload for a local record (explicit field list — never spread). */
  toRemoteDoc: (local: L, ownerHash: string) => Record<string, unknown>;
  /** Local record from a remote doc, stripping remote-only fields. */
  toLocalRecord: (remote: R) => L;
  bulkPutLocal: (records: L[]) => Promise<unknown>;
  bulkDeleteLocal: (ids: string[]) => Promise<unknown>;
}

interface SyncContext {
  firestore: Firestore;
  uid: string;
  ownerHash: string;
  characterId: number;
  now: number;
}

async function fetchOwnedDocs<R extends RemoteDoc>(
  col: CollectionReference,
  ownerHash: string
): Promise<R[]> {
  // Rules allow listing only what the client's where clause provably scopes to;
  // an unfiltered getDocs would also trip over stale-hash docs after a transfer.
  const snapshot = await getDocs(query(col, where('ownerHash', '==', ownerHash)));
  return snapshot.docs.map((d) => d.data() as R);
}

async function syncEditableCollection<L extends SyncRecord, R extends RemoteDoc>(
  spec: CollectionSpec<L, R>,
  ctx: SyncContext
): Promise<void> {
  const col = collection(ctx.firestore, 'characters', ctx.uid, spec.name);
  const remote = await fetchOwnedDocs<R>(col, ctx.ownerHash);
  const local = await spec.loadLocal(ctx.characterId);
  const tombstoneKey = spec.tombstoneKey(ctx.characterId);
  const tombstones = await readTombstones(tombstoneKey);
  const plan = mergeRecords<L, R>(local, tombstones, remote, ctx.now);

  await Promise.all([
    ...plan.pushUpserts.map((p) => setDoc(doc(col, p.id), spec.toRemoteDoc(p, ctx.ownerHash))),
    ...plan.pushTombstones.map((t) =>
      setDoc(doc(col, t.id), {
        id: t.id,
        characterId: ctx.characterId,
        updatedAt: t.deletedAt,
        ownerHash: ctx.ownerHash,
        deleted: true,
      })
    ),
    ...plan.purgeRemote.map((id) => deleteDoc(doc(col, id))),
  ]);

  if (plan.pullUpserts.length > 0) {
    await spec.bulkPutLocal(plan.pullUpserts.map(spec.toLocalRecord));
  }
  if (plan.deleteLocal.length > 0) {
    await spec.bulkDeleteLocal(plan.deleteLocal);
  }
  // Pushed tombstones are now recorded remotely; resolved ones are dropped.
  const settled = new Set([...plan.clearLocalTombstones, ...plan.pushTombstones.map((t) => t.id)]);
  if (settled.size > 0) {
    await writeTombstones(
      tombstoneKey,
      tombstones.filter((t) => !settled.has(t.id))
    );
  }
}

const skillPlanSpec: CollectionSpec<SkillPlanRecord, RemotePlanDoc> = {
  name: 'plans',
  tombstoneKey: planTombstonesKey,
  loadLocal: (characterId) => db.skillPlans.where('characterId').equals(characterId).toArray(),
  toRemoteDoc: (p, ownerHash) => ({
    id: p.id,
    characterId: p.characterId,
    name: p.name,
    entries: p.entries,
    remapCount: p.remapCount,
    // Firestore rejects undefined values, so optional fields are omitted.
    ...(p.markers !== undefined ? { markers: p.markers } : {}),
    updatedAt: p.updatedAt,
    ownerHash,
    deleted: false,
  }),
  toLocalRecord: (r) => ({
    id: r.id,
    characterId: r.characterId,
    name: r.name,
    entries: r.entries,
    remapCount: r.remapCount,
    ...(r.markers !== undefined ? { markers: r.markers } : {}),
    updatedAt: r.updatedAt,
  }),
  bulkPutLocal: (records) => db.skillPlans.bulkPut(records),
  bulkDeleteLocal: (ids) => db.skillPlans.bulkDelete(ids),
};

const buildPlanSpec: CollectionSpec<BuildPlanRecord, RemoteBuildPlanDoc> = {
  name: 'buildPlans',
  tombstoneKey: buildPlanTombstonesKey,
  loadLocal: (characterId) => db.buildPlans.where('characterId').equals(characterId).toArray(),
  toRemoteDoc: (p, ownerHash) => ({
    id: p.id,
    characterId: p.characterId,
    name: p.name,
    blueprintTypeID: p.blueprintTypeID,
    runs: p.runs,
    me: p.me,
    te: p.te,
    facility: p.facility,
    rigLevel: p.rigLevel,
    security: p.security,
    hubId: p.hubId,
    ...(p.facilityTaxPct !== undefined ? { facilityTaxPct: p.facilityTaxPct } : {}),
    updatedAt: p.updatedAt,
    ownerHash,
    deleted: false,
  }),
  toLocalRecord: (r) => ({
    id: r.id,
    characterId: r.characterId,
    name: r.name,
    blueprintTypeID: r.blueprintTypeID,
    runs: r.runs,
    me: r.me,
    te: r.te,
    facility: r.facility,
    rigLevel: r.rigLevel,
    security: r.security,
    hubId: r.hubId,
    ...(r.facilityTaxPct !== undefined ? { facilityTaxPct: r.facilityTaxPct } : {}),
    updatedAt: r.updatedAt,
  }),
  bulkPutLocal: (records) => db.buildPlans.bulkPut(records),
  bulkDeleteLocal: (ids) => db.buildPlans.bulkDelete(ids),
};

const quickbarSpec: CollectionSpec<QuickbarRecord, RemoteQuickbarDoc> = {
  name: 'quickbars',
  tombstoneKey: quickbarTombstonesKey,
  loadLocal: (characterId) => db.quickbars.where('characterId').equals(characterId).toArray(),
  toRemoteDoc: (q, ownerHash) => ({
    id: q.id,
    characterId: q.characterId,
    items: q.items,
    updatedAt: q.updatedAt,
    ownerHash,
    deleted: false,
  }),
  toLocalRecord: (r) => ({
    id: r.id,
    characterId: r.characterId,
    items: r.items,
    updatedAt: r.updatedAt,
  }),
  bulkPutLocal: (records) => db.quickbars.bulkPut(records),
  bulkDeleteLocal: (ids) => db.quickbars.bulkDelete(ids),
};

async function syncCharacter(characterId: number): Promise<void> {
  const character = await db.characters.get(characterId);
  if (!character) throw new Error(`Unknown character ${characterId}`);
  await handleOwnerHashChange(character);

  const uid = await ensureSignedIn(characterId);
  const firestore = getSyncFirestore();
  const ownerHash = character.ownerHash;
  const now = Date.now();
  const ctx: SyncContext = { firestore, uid, ownerHash, characterId, now };

  await syncEditableCollection(skillPlanSpec, ctx);
  await syncEditableCollection(buildPlanSpec, ctx);
  await syncEditableCollection(quickbarSpec, ctx);

  // ---- Synced settings ----
  const settingsCol = collection(firestore, 'characters', uid, 'settings');
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
  let metaDirty = false;

  await Promise.all([
    ...settings.push.map((s) => {
      // A key written outside setSyncedSetting has no timestamp yet: stamp now.
      const updatedAt = s.updatedAt > 0 ? s.updatedAt : now;
      if (meta[s.key] !== updatedAt) {
        meta[s.key] = updatedAt;
        metaDirty = true;
      }
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

  for (const s of settings.pull) {
    await db.settings.put({ key: s.key, value: s.value });
    meta[s.key] = s.updatedAt;
    metaDirty = true;
  }
  for (const key of settings.deleteLocal) {
    await db.settings.delete(key);
    if (key in meta) {
      delete meta[key];
      metaDirty = true;
    }
  }
  if (metaDirty) await writeSettingsMeta(meta);

  // Do NOT also clear on settings.pushTombstones: a tombstone that was just
  // pushed is not yet resolved — see mergeSettings for why it must survive
  // until a remote write postdates the delete.
  if (settings.clearLocalTombstones.length > 0) {
    const cleared = new Set(settings.clearLocalTombstones);
    await writeSettingsTombstones(settingsTombstones.filter((t) => !cleared.has(t.key)));
  }
}
