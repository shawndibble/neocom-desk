/**
 * What the app does the moment the connection comes back, in one place.
 *
 * Offline, a lot of work was deferred or answered from the stored row, and none
 * of it knows the network returned: a revalidation that failed offline holds
 * its cache key for a freshness window (`esi/cache.ts`), the sync that failed
 * is not retried until the next edit, and the lazy SDE warm gave up. This
 * wires `onReconnect` (`stores/network.ts`) to each of those.
 *
 * The notification poller's catch-up is not here: it needs the poller's tab
 * leadership, so `ForegroundNotificationPoller.tsx` subscribes to `onReconnect`
 * itself.
 */
import { clearRevalidationFailures, emitCacheRevalidated } from '@/esi/cache';
import { triggerSync } from '@/sync';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { onReconnect } from '@/stores/network';
import { isSyncConfigured } from './syncStatus';

export interface ReconnectRecoveryDeps {
  clearRevalidationFailures: () => void;
  emitCacheRevalidated: () => void;
  activeCharacterId: () => number | null;
  syncConfigured: () => boolean;
  triggerSync: (characterId: number) => Promise<void>;
  warmLazySde: () => Promise<void>;
}

const liveDeps: ReconnectRecoveryDeps = {
  clearRevalidationFailures,
  emitCacheRevalidated,
  activeCharacterId: () => useActiveCharacter.getState().activeCharacterId,
  syncConfigured: () => isSyncConfigured(),
  triggerSync,
  // The warm checks the connection gate itself (`warmLazySde`), so a metered
  // or Save-Data connection still skips the large files.
  warmLazySde: async () => {
    const { warmLazySde } = await import('@/sde/warmLazySde');
    await warmLazySde({ cancelled: false });
  },
};

/** One recovery pass. Everything after the cache reset is best effort. */
export function recoverFromReconnect(deps: ReconnectRecoveryDeps = liveDeps): void {
  // Failures first: the re-read the signal triggers must reach the network
  // rather than be answered from the row a failure was holding.
  deps.clearRevalidationFailures();
  deps.emitCacheRevalidated();

  const characterId = deps.activeCharacterId();
  if (characterId !== null && deps.syncConfigured()) {
    // A failure is already published through `subscribeSyncStatus`.
    void deps.triggerSync(characterId).catch(() => {});
  }
  void deps.warmLazySde().catch(() => {});
}

/** Runs the recovery on every reconnect. Returns the unsubscribe. */
export function startReconnectRecovery(deps: ReconnectRecoveryDeps = liveDeps): () => void {
  return onReconnect(() => recoverFromReconnect(deps));
}
