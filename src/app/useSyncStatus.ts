import { useEffect, useState } from 'react';
import { subscribeSyncStatus, type SyncStatus } from '@/sync';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useOnline } from '@/stores/network';

const INITIAL_SYNC_STATUS: SyncStatus = { state: 'idle', lastSyncedAt: null, error: null };

/**
 * Live sync status + browser online/offline, combined the same way
 * everywhere it's consumed (nav dot, per-page error notes): browser offline
 * always wins over whatever the last known sync state was (see
 * `syncStatus.ts`'s `syncDisplayState`).
 *
 * Scoped to the active Character: `subscribeSyncStatus` is one stream
 * carrying every Character's status, and `backgroundSync.ts` syncs Characters
 * nobody is looking at, whose failures are not this UI's to report. A status
 * with no `characterId` predates the first sync (`sync/status.ts`) and belongs
 * to nobody in particular, so it still applies.
 */
export function useSyncStatus(): { status: SyncStatus; online: boolean } {
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const [status, setStatus] = useState<SyncStatus>(INITIAL_SYNC_STATUS);
  const online = useOnline();

  useEffect(
    () =>
      subscribeSyncStatus((next) => {
        if (next.characterId === undefined || next.characterId === activeCharacterId) {
          setStatus(next);
        }
      }),
    [activeCharacterId]
  );

  return { status, online };
}
