import { clearRevalidationFailures, emitCacheRevalidated } from '@/esi/cache';
import { triggerSync } from '@/sync';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { onReconnect } from '@/stores/network';
import { scheduleLazySdeWarm } from './bootPrefetch';
import { isSyncConfigured } from './syncStatus';

export interface ReconnectRecoveryDeps {
  clearRevalidationFailures: () => void;
  emitCacheRevalidated: () => void;
  activeCharacterId: () => number | null;
  syncConfigured: () => boolean;
  triggerSync: (characterId: number) => Promise<void>;
  scheduleSdeWarm: () => void;
}

let cancelSdeWarm = () => {};

function scheduleSdeWarmOnce(): void {
  cancelSdeWarm();
  cancelSdeWarm = scheduleLazySdeWarm(0);
}

const liveDeps: ReconnectRecoveryDeps = {
  clearRevalidationFailures,
  emitCacheRevalidated,
  activeCharacterId: () => useActiveCharacter.getState().activeCharacterId,
  syncConfigured: () => isSyncConfigured(),
  triggerSync,
  scheduleSdeWarm: scheduleSdeWarmOnce,
};

export function recoverFromReconnect(deps: ReconnectRecoveryDeps = liveDeps): void {
  deps.clearRevalidationFailures();
  deps.emitCacheRevalidated();

  const characterId = deps.activeCharacterId();
  if (characterId !== null && deps.syncConfigured()) {
    void deps.triggerSync(characterId).catch(() => {});
  }
  deps.scheduleSdeWarm();
}

export function startReconnectRecovery(deps: ReconnectRecoveryDeps = liveDeps): () => void {
  return onReconnect(() => recoverFromReconnect(deps));
}
