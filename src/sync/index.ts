// Public sync API. UI wiring (app start trigger, status display, character
// switch) is owned by src/app — import from '@/sync' only.
//
// This barrel is also the Firebase code-splitting boundary. `planSync.ts`
// statically imports firebase/{app,auth,firestore/lite,functions}, which is
// ~160 KB gzip; a static re-export from here would drag all of it into the
// entry chunk, because App.tsx, Layout.tsx (via useSyncStatus) and the
// SkillPlans/Industry routes all import this module eagerly. So every export
// that can reach Firebase is a thin wrapper around `await import('./planSync')`
// and lands in its own async chunk, fetched on the first actual sync.
//
// The status store (status.ts) and uidForCharacter (uid.ts) touch no Firebase
// and stay synchronous re-exports, so the nav dot can subscribe at first paint.

export { getSyncStatus, subscribeSyncStatus, type SyncState, type SyncStatus } from './status';
export { uidForCharacter } from './uid';
export { TOMBSTONE_TTL_MS } from './merge';

/**
 * Run a sync now. Coalesced per character and serialized globally — see
 * planSync.ts. Rejects with the sync failure (also surfaced via
 * subscribeSyncStatus), or with a chunk-load error if the driver can't load.
 */
export async function triggerSync(characterId: number): Promise<void> {
  const { triggerSync } = await import('./planSync');
  return triggerSync(characterId);
}

/**
 * Debounced sync — call after each edit. Fire-and-forget, as before: a failed
 * driver load (offline before the chunk is precached) is swallowed, and the
 * sync simply doesn't happen.
 */
export function scheduleSync(characterId: number, debounceMs?: number): void {
  void import('./planSync').then((m) => m.scheduleSync(characterId, debounceMs)).catch(() => {});
}

/**
 * Delete a Skill Plan locally and record a tombstone so the deletion
 * propagates to other devices on the next sync. Always use this instead of
 * deleting the Dexie row directly, or the plan will resurrect from the remote
 * copy.
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

/** Write a synced setting ('sync.'-prefixed key) and stamp it for LWW merging. */
export async function setSyncedSetting(key: string, value: unknown): Promise<void> {
  const { setSyncedSetting } = await import('./planSync');
  return setSyncedSetting(key, value);
}

/** Ensure the Firebase session is signed in as this character; returns the uid. */
export async function ensureSignedIn(characterId: number): Promise<string> {
  const { ensureSignedIn } = await import('./syncAuth');
  return ensureSignedIn(characterId);
}
