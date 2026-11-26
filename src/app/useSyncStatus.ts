import { useEffect, useState } from 'react';
import { subscribeSyncStatus, type SyncStatus } from '@/sync';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useOnline } from '@/stores/network';

const INITIAL_SYNC_STATUS: SyncStatus = { state: 'idle', lastSyncedAt: null, error: null };

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
