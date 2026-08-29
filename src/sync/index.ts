// Public sync API. UI wiring (app start trigger, status display, character
// switch) is owned by src/app — import from '@/sync' only.

export {
  triggerSync,
  scheduleSync,
  subscribeSyncStatus,
  getSyncStatus,
  markPlanDeleted,
  markBuildPlanDeleted,
  setSyncedSetting,
  type SyncState,
  type SyncStatus,
} from './planSync';
export { ensureSignedIn, uidForCharacter } from './syncAuth';
export { TOMBSTONE_TTL_MS } from './merge';
