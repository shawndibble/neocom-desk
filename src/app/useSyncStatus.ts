import { useEffect, useState } from 'react';
import { subscribeSyncStatus, type SyncStatus } from '@/sync';

const INITIAL_SYNC_STATUS: SyncStatus = { state: 'idle', lastSyncedAt: null, error: null };

/**
 * Live sync status + browser online/offline, combined the same way
 * everywhere it's consumed (nav dot, per-page error notes): browser offline
 * always wins over whatever the last known sync state was (see
 * `syncStatus.ts`'s `syncDisplayState`).
 */
export function useSyncStatus(): { status: SyncStatus; online: boolean } {
  const [status, setStatus] = useState<SyncStatus>(INITIAL_SYNC_STATUS);
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  );

  useEffect(() => subscribeSyncStatus(setStatus), []);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return { status, online };
}
