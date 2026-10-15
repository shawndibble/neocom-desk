import { useEffect } from 'react';
import { isSyncConfigured } from '@/app/syncStatus';

/** First run waits out boot and the shared-library publish. */
export const DELIVERY_BOOT_DELAY_MS = 45 * 1000;
/** Then every half hour; a run with no open Pledge costs two reads per Community. */
export const DELIVERY_INTERVAL_MS = 30 * 60 * 1000;

let sweeping = false;

/**
 * Marks Pledge deliveries from each Character's finished contracts (issue
 * #3809): one sweep after boot, then on a timer, for as long as the app is
 * open. No setting: a Character without the contracts Permission is skipped
 * before it is signed in. The active Character goes last so the Firebase
 * session is left on it (see `usePublishSharedLibraries`). A failed run is
 * silent here and retried; the Request panel runs it again on open and says
 * what went wrong.
 */
export function useSyncRequestDeliveries(
  characterIds: readonly number[] | undefined,
  activeCharacterId: number | null
): void {
  const key = characterIds?.join(',') ?? '';
  useEffect(() => {
    if (!characterIds?.length || !isSyncConfigured()) return;
    const sweep = async () => {
      if (sweeping) return;
      sweeping = true;
      try {
        const { hasDeliveryScope, syncRequestDeliveries } = await import('./requestDelivery');
        const { listCommunityIds } = await import('./communityStore');
        const ordered = [...characterIds].sort(
          (a, b) => Number(a === activeCharacterId) - Number(b === activeCharacterId)
        );
        for (const id of ordered) {
          if (!(await hasDeliveryScope(id))) continue;
          try {
            for (const communityId of await listCommunityIds(id)) {
              await syncRequestDeliveries(id, communityId);
            }
          } catch {
            // Offline or signed out for this Character: the next sweep retries.
          }
        }
      } finally {
        sweeping = false;
      }
    };
    const boot = setTimeout(() => void sweep(), DELIVERY_BOOT_DELAY_MS);
    const timer = setInterval(() => void sweep(), DELIVERY_INTERVAL_MS);
    return () => {
      clearTimeout(boot);
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands for the id list's contents.
  }, [key, activeCharacterId]);
}
