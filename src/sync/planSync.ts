// Two-way sync of Skill Plans + synced settings for one character.
//
// Public API (UI wiring is owned elsewhere — see index.ts):
//   triggerSync(characterId)    run a sync now (coalesced per character)
//   scheduleSync(characterId)   debounced sync after edits
//   subscribeSyncStatus(fn)     observe idle/syncing/error + lastSyncedAt
//   markPlanDeleted(...)        delete a plan locally AND record a tombstone
//   setSyncedSetting(key, v)    write a synced ('sync.'-prefixed) setting
//
// Remote layout: /characters/char:{id}/plans/{planId} and .../settings/{key}.
// Merge policy lives in merge.ts (pure): last-write-wins per plan id,
// tombstones for deletes kept 30 days.
//
// Owner-hash safety: if the character's ownerHash changed since the last sync
// (character sold/transferred), local plans for it are wiped before syncing so
// the previous owner's data neither leaks in nor gets pushed up. Server-side,
// Firestore rules deny reads of docs whose ownerHash field doesn't match the
// auth token's ownerHash claim.

import { collection, deleteDoc, doc, getDocs, setDoc } from 'firebase/firestore';
import { db, type CharacterRecord, type SkillPlanRecord } from '@/db';
import { getSyncFirestore } from './firebaseApp';
import { ensureSignedIn } from './syncAuth';
import {
  mergePlans,
  mergeSettings,
  type LocalTombstone,
  type RemotePlanDoc,
  type SyncedSettingValue,
} from './merge';

// ---------------------------------------------------------------------------
// Local bookkeeping (Dexie settings table). Keys under 'sync.__' are internal
// and never synced; keys under 'sync.' (without the double underscore) are the
// user settings that DO sync.
// ---------------------------------------------------------------------------

const SYNCED_PREFIX = 'sync.';
const INTERNAL_PREFIX = 'sync.__';
const tombstonesKey = (characterId: number) => `${INTERNAL_PREFIX}tombstones.${characterId}`;
const ownerHashKey = (characterId: number) => `${INTERNAL_PREFIX}ownerHash.${characterId}`;
const SETTINGS_META_KEY = `${INTERNAL_PREFIX}settingsMeta`;

function isSyncedSettingKey(key: string): boolean {
  return key.startsWith(SYNCED_PREFIX) && !key.startsWith(INTERNAL_PREFIX);
}

async function readTombstones(characterId: number): Promise<LocalTombstone[]> {
  const record = await db.settings.get(tombstonesKey(characterId));
  return Array.isArray(record?.value) ? (record.value as LocalTombstone[]) : [];
}

async function writeTombstones(characterId: number, tombstones: LocalTombstone[]): Promise<void> {
  await db.settings.put({ key: tombstonesKey(characterId), value: tombstones });
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

// ---------------------------------------------------------------------------
// Sync status
// ---------------------------------------------------------------------------

export type SyncState = 'idle' | 'syncing' | 'error';

export interface SyncStatus {
  state: SyncState;
  /** Epoch ms of the last successful sync this session, or null. */
  lastSyncedAt: number | null;
  error: string | null;
}

let status: SyncStatus = { state: 'idle', lastSyncedAt: null, error: null };
const listeners = new Set<(status: SyncStatus) => void>();

function setStatus(patch: Partial<SyncStatus>): void {
  status = { ...status, ...patch };
  for (const listener of listeners) listener(status);
}

/** Subscribe to sync status; the listener is called immediately with the current value. */
export function subscribeSyncStatus(listener: (status: SyncStatus) => void): () => void {
  listeners.add(listener);
  listener(status);
  return () => listeners.delete(listener);
}

// ---------------------------------------------------------------------------
// Mutation helpers the UI layer should use
// ---------------------------------------------------------------------------

/**
 * Delete a plan locally and record a tombstone so the deletion propagates to
 * other devices on the next sync. Always use this instead of deleting the
 * Dexie row directly, or the plan will resurrect from the remote copy.
 */
export async function markPlanDeleted(characterId: number, planId: string): Promise<void> {
  await db.skillPlans.delete(planId);
  const tombstones = (await readTombstones(characterId)).filter((t) => t.id !== planId);
  tombstones.push({ id: planId, deletedAt: Date.now() });
  await writeTombstones(characterId, tombstones);
  scheduleSync(characterId);
}

/** Write a synced setting ('sync.'-prefixed key) and stamp it for LWW merging. */
export async function setSyncedSetting(key: string, value: unknown): Promise<void> {
  if (!isSyncedSettingKey(key)) {
    throw new Error(`Synced settings keys must start with '${SYNCED_PREFIX}' (got '${key}')`);
  }
  await db.settings.put({ key, value });
  const meta = await readSettingsMeta();
  meta[key] = Date.now();
  await writeSettingsMeta(meta);
}

// ---------------------------------------------------------------------------
// Sync driver
// ---------------------------------------------------------------------------

const running = new Map<number, Promise<void>>();
const pendingTimers = new Map<number, ReturnType<typeof setTimeout>>();
const DEFAULT_DEBOUNCE_MS = 2000;

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

/** Run a sync now. Coalesced: a sync already running for this character is awaited instead. */
export function triggerSync(characterId: number): Promise<void> {
  const pending = pendingTimers.get(characterId);
  if (pending !== undefined) {
    clearTimeout(pending);
    pendingTimers.delete(characterId);
  }
  const active = running.get(characterId);
  if (active) return active;

  const run = (async () => {
    setStatus({ state: 'syncing', error: null });
    try {
      await syncCharacter(characterId);
      setStatus({ state: 'idle', lastSyncedAt: Date.now(), error: null });
    } catch (error) {
      setStatus({ state: 'error', error: error instanceof Error ? error.message : String(error) });
      throw error;
    } finally {
      running.delete(characterId);
    }
  })();
  running.set(characterId, run);
  return run;
}

/**
 * Owner-hash check: EVE changes a character's ownerHash when it is sold or
 * transferred. If it changed since our last sync, the local plans belong to
 * the previous owner — wipe them (and pending tombstones) so nothing leaks
 * into or out of the new owner's account.
 */
async function handleOwnerHashChange(character: CharacterRecord): Promise<void> {
  const key = ownerHashKey(character.characterId);
  const stored = await db.settings.get(key);
  if (stored !== undefined && stored.value !== character.ownerHash) {
    await db.skillPlans.where('characterId').equals(character.characterId).delete();
    await writeTombstones(character.characterId, []);
  }
  await db.settings.put({ key, value: character.ownerHash });
}

function toLocalPlan(remote: RemotePlanDoc): SkillPlanRecord {
  return {
    id: remote.id,
    characterId: remote.characterId,
    name: remote.name,
    entries: remote.entries,
    remapCount: remote.remapCount,
    updatedAt: remote.updatedAt,
  };
}

async function syncCharacter(characterId: number): Promise<void> {
  const character = await db.characters.get(characterId);
  if (!character) throw new Error(`Unknown character ${characterId}`);
  await handleOwnerHashChange(character);

  const uid = await ensureSignedIn(characterId);
  const firestore = getSyncFirestore();
  const ownerHash = character.ownerHash;
  const now = Date.now();

  // ---- Skill Plans ----
  const plansCol = collection(firestore, 'characters', uid, 'plans');
  const remotePlans = (await getDocs(plansCol)).docs.map((d) => d.data() as RemotePlanDoc);
  const localPlans = await db.skillPlans.where('characterId').equals(characterId).toArray();
  const tombstones = await readTombstones(characterId);
  const plan = mergePlans(localPlans, tombstones, remotePlans, now);

  await Promise.all([
    ...plan.pushUpserts.map((p) =>
      setDoc(doc(plansCol, p.id), {
        id: p.id,
        characterId: p.characterId,
        name: p.name,
        entries: p.entries,
        remapCount: p.remapCount,
        updatedAt: p.updatedAt,
        ownerHash,
        deleted: false,
      })
    ),
    ...plan.pushTombstones.map((t) =>
      setDoc(doc(plansCol, t.id), {
        id: t.id,
        characterId,
        updatedAt: t.deletedAt,
        ownerHash,
        deleted: true,
      })
    ),
    ...plan.purgeRemote.map((id) => deleteDoc(doc(plansCol, id))),
  ]);

  if (plan.pullUpserts.length > 0) {
    await db.skillPlans.bulkPut(plan.pullUpserts.map(toLocalPlan));
  }
  if (plan.deleteLocal.length > 0) {
    await db.skillPlans.bulkDelete(plan.deleteLocal);
  }
  // Pushed tombstones are now recorded remotely; resolved ones are dropped.
  const settled = new Set([...plan.clearLocalTombstones, ...plan.pushTombstones.map((t) => t.id)]);
  if (settled.size > 0) {
    await writeTombstones(
      characterId,
      tombstones.filter((t) => !settled.has(t.id))
    );
  }

  // ---- Synced settings ----
  const settingsCol = collection(firestore, 'characters', uid, 'settings');
  const remoteSettings = (await getDocs(settingsCol)).docs.map(
    (d) => d.data() as SyncedSettingValue
  );
  const meta = await readSettingsMeta();
  const localSettings: SyncedSettingValue[] = (await db.settings.toArray())
    .filter((record) => isSyncedSettingKey(record.key))
    .map((record) => ({ key: record.key, value: record.value, updatedAt: meta[record.key] ?? 0 }));

  const settings = mergeSettings(localSettings, remoteSettings);
  let metaDirty = false;

  await Promise.all(
    settings.push.map((s) => {
      // A key written outside setSyncedSetting has no timestamp yet: stamp now.
      const updatedAt = s.updatedAt > 0 ? s.updatedAt : now;
      if (meta[s.key] !== updatedAt) {
        meta[s.key] = updatedAt;
        metaDirty = true;
      }
      return setDoc(doc(settingsCol, s.key), { key: s.key, value: s.value, updatedAt, ownerHash });
    })
  );
  for (const s of settings.pull) {
    await db.settings.put({ key: s.key, value: s.value });
    meta[s.key] = s.updatedAt;
    metaDirty = true;
  }
  if (metaDirty) await writeSettingsMeta(meta);
}
