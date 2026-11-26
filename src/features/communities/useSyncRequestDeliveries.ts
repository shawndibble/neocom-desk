import { useEffect } from 'react';
import { isSyncConfigured } from '@/app/syncStatus';
import { joinTabElection } from '@/lib/tabLeader';

export const DELIVERY_BOOT_DELAY_MS = 45 * 1000;
export const DELIVERY_INTERVAL_MS = 30 * 60 * 1000;

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
