// Public sync API — import from '@/sync' only; UI wiring is owned by src/app.
//
// Also the Firebase code-splitting boundary: `planSync.ts` statically imports
// ~160 KB gzip of firebase/{app,auth,firestore/lite,functions}, and App.tsx,
// Layout.tsx and the SkillPlans/Industry routes all import this barrel eagerly.
// So every export that can reach Firebase must be a thin wrapper around
// `await import('./planSync')`, landing in its own async chunk. status.ts and
// uid.ts touch no Firebase and stay synchronous, so the nav dot can subscribe
// at first paint.

export { getSyncStatus, subscribeSyncStatus, type SyncState, type SyncStatus } from './status';
export { uidForCharacter } from './uid';
export { TOMBSTONE_TTL_MS } from './merge';
export { clearCharacterSyncBookkeeping } from './localBookkeeping';
// Touches Dexie only — no Firebase — so it needs no lazy-import wrapper.
export { backfillAccountWideData } from './accountWideBackfill';

/**
 * Run a sync now. Coalesced per character and serialized globally (planSync.ts).
 * Rejects with the sync failure (also surfaced via subscribeSyncStatus), or a
 * chunk-load error if the driver can't load.
 */
export async function triggerSync(characterId: number): Promise<void> {
  const { triggerSync } = await import('./planSync');
  return triggerSync(characterId);
}

/**
 * Debounced sync — call after each edit. Fire-and-forget: a failed driver load
 * (offline before the chunk is precached) is swallowed and no sync happens.
 */
export function scheduleSync(characterId: number, debounceMs?: number): void {
  void import('./planSync').then((m) => m.scheduleSync(characterId, debounceMs)).catch(() => {});
}

/**
 * Delete a Skill Plan locally and record a tombstone so the deletion propagates
 * on the next sync. Use this rather than deleting the Dexie row directly, or
 * the plan resurrects from the remote copy.
 */
export async function markPlanDeleted(characterId: number, planId: string): Promise<void> {
  const { markPlanDeleted } = await import('./planSync');
  return markPlanDeleted(characterId, planId);
}

/** Build Plan analogue of markPlanDeleted — same tombstone semantics. */
export async function markBuildPlanDeleted(characterId: number, planId: string): Promise<void> {
  const { markBuildPlanDeleted } = await import('./planSync');
  return markBuildPlanDeleted(characterId, planId);
}

/** Pin a station for one Character only (issue #84's per-character pin state). */
export async function setCharacterStationPin(
  characterId: number,
  locationId: number
): Promise<void> {
  const { setCharacterStationPin } = await import('./planSync');
  return setCharacterStationPin(characterId, locationId);
}

/**
 * Elevate a station's pin to account-wide — fanned out to every Character
 * currently known on this device (parity-plan §5.7), each syncing under its
 * own ownerHash.
 */
export async function setAccountStationPin(locationId: number): Promise<void> {
  const { setAccountStationPin } = await import('./planSync');
  return setAccountStationPin(locationId);
}

/** Unpin a station entirely, tombstoning its pin row for every Character it was written under. */
export async function clearStationPin(locationId: number): Promise<void> {
  const { clearStationPin } = await import('./planSync');
  return clearStationPin(locationId);
}

/** Write a synced setting ('sync.'-prefixed key) and stamp it for LWW merging. */
export async function setSyncedSetting(key: string, value: unknown): Promise<void> {
  const { setSyncedSetting } = await import('./planSync');
  return setSyncedSetting(key, value);
}

/** Delete a synced setting and propagate the deletion as a tombstone. */
export async function deleteSyncedSetting(key: string): Promise<void> {
  const { deleteSyncedSetting } = await import('./planSync');
  return deleteSyncedSetting(key);
}

/** Ensure the Firebase session is signed in as this character; returns the uid. */
export async function ensureSignedIn(characterId: number): Promise<string> {
  const { ensureSignedIn } = await import('./syncAuth');
  return ensureSignedIn(characterId);
}

/**
 * Purge a removed Character's remote Firestore docs (plans, buildPlans,
 * quickbars, stationPins, settings) right now. If it can't run (most commonly a dead
 * refresh token — the Character can no longer sign in), records a pending
 * purge that the next successful sync for it retries automatically. Returns
 * whether the purge ran immediately.
 */
export async function purgeCharacterRemoteDataOrDefer(characterId: number): Promise<boolean> {
  const { purgeCharacterRemoteDataOrDefer } = await import('./characterPurge');
  return purgeCharacterRemoteDataOrDefer(characterId);
}
