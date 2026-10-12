import { useEffect } from 'react';
import { isSyncConfigured } from '@/app/syncStatus';
import { hasShareSelections } from './shareSelection';

/** First publish waits out boot, like the background sync sweep. */
export const PUBLISH_BOOT_DELAY_MS = 20 * 1000;
/** Then every half hour. The hash check makes a sweep with nothing new cost one read. */
export const PUBLISH_INTERVAL_MS = 30 * 60 * 1000;

let sweeping = false;

/**
 * Keeps each Character's Shared Blueprints current in its Communities (issue
 * #3600): one sweep after boot, then on a timer. Only Characters that share
 * something are signed in for, and the active Character goes last so the
 * Firebase session is left on it (see `app/backgroundSync.ts`).
 */
export function usePublishSharedLibraries(
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
        const { publishAllSharedLibraries } = await import('./libraryPush');
        const { syncAllSharedPlans } = await import('./sharedPlans');
        const ordered = [...characterIds].sort(
          (a, b) => Number(a === activeCharacterId) - Number(b === activeCharacterId)
        );
        for (const id of ordered) {
          if (await hasShareSelections([id])) {
            await publishAllSharedLibraries(id);
            await syncAllSharedPlans(id);
          }
        }
      } catch {
        // Offline or signed out: the next sweep retries.
      } finally {
        sweeping = false;
      }
    };
    const boot = setTimeout(() => void sweep(), PUBLISH_BOOT_DELAY_MS);
    const timer = setInterval(() => void sweep(), PUBLISH_INTERVAL_MS);
    return () => {
      clearTimeout(boot);
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands for the id list's contents.
  }, [key, activeCharacterId]);
}
