/**
 * When the active Character's sync pass starts at boot (and on a Character
 * switch): in the browser's first idle slot, not in the effect that mounts the
 * app.
 *
 * A pass loads the Firebase SDK chunk, signs in, and reads and writes every
 * synced Dexie collection. Started at mount it competed with the first route's
 * own render and Dexie reads for the main thread. Nothing on first paint waits
 * for it: pages render from Dexie, and pulled changes land through live
 * queries whenever the pass finishes.
 */

// Not imported from ./bootPrefetch: route tests mock that module wholesale.
import { BOOT_IDLE_TIMEOUT_MS, scheduleIdle } from '@/lib/scheduleIdle';

/** Upper bound on the wait for an idle slot: the boot prefetch's. */
export const BOOT_SYNC_IDLE_TIMEOUT_MS = BOOT_IDLE_TIMEOUT_MS;

/** Schedules `sync(characterId)` and returns its cancel (call it on Character switch). */
export function scheduleBootSync(
  characterId: number,
  sync: (characterId: number) => void
): () => void {
  let cancelled = false;
  const start = () => {
    if (!cancelled) sync(characterId);
  };
  const cancelWait = scheduleIdle(start, BOOT_SYNC_IDLE_TIMEOUT_MS);
  return () => {
    cancelled = true;
    cancelWait();
  };
}
