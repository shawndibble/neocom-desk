import { useEffect } from 'react';
import { isSyncConfigured } from '@/app/syncStatus';
import { joinTabElection } from '@/lib/tabLeader';

/** First run waits out boot and the shared-library publish. */
export const DELIVERY_BOOT_DELAY_MS = 45 * 1000;
/** Then every half hour; a run with no open Pledge costs two reads per Community. */
export const DELIVERY_INTERVAL_MS = 30 * 60 * 1000;

/**
 * Marks Pledge deliveries from each Character's finished contracts (issue
 * #3809): one sweep after boot, then on a timer, for as long as the app is
 * open. No setting: a Character without the contracts Permission is skipped
 * before it is signed in. The active Character goes last so the Firebase
 * session is left on it (see `usePublishSharedLibraries`). A failed run is
 * logged here and retried; the Request panel runs it again on open and says
 * what went wrong. Overlapping runs are not a concern: `syncRequestDeliveries`
 * shares one run per Character and Community, and a sweep stops between
 * Characters once the effect is cleaned up.
 */
export function useSyncRequestDeliveries(
  characterIds: readonly number[] | undefined,
  activeCharacterId: number | null
): void {
  const key = characterIds?.join(',') ?? '';
  useEffect(() => {
    if (!characterIds?.length || !isSyncConfigured()) return;
    let cancelled = false;
    const seat = joinTabElection('sweep', () => {});
    const sweep = async () => {
      if (document.visibilityState !== 'visible' || !seat.isLeader()) return;
      const { hasDeliveryScope, syncRequestDeliveries } = await import('./requestDelivery');
      const { listCommunityIds } = await import('./communityStore');
      const ordered = [...characterIds].sort(
        (a, b) => Number(a === activeCharacterId) - Number(b === activeCharacterId)
      );
      for (const id of ordered) {
        if (cancelled) return;
        if (!(await hasDeliveryScope(id))) continue;
        try {
          for (const communityId of await listCommunityIds(id)) {
            if (cancelled) return;
            await syncRequestDeliveries(id, communityId);
          }
        } catch (err) {
          // Offline or signed out for this Character: the next sweep retries.
          console.warn('Request delivery sweep failed for a Character', err);
        }
      }
    };
    const run = () =>
      void sweep().catch((err) => console.warn('Request delivery sweep failed', err));
    const boot = setTimeout(run, DELIVERY_BOOT_DELAY_MS);
    const timer = setInterval(run, DELIVERY_INTERVAL_MS);
    return () => {
      cancelled = true;
      seat.leave();
      clearTimeout(boot);
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands for the id list's contents.
  }, [key, activeCharacterId]);
}
