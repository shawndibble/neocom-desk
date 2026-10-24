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

/** Upper bound on the wait for an idle slot (and the timer fallback's delay). */
export const BOOT_SYNC_IDLE_TIMEOUT_MS = 2000;

/** Schedules `sync(characterId)` and returns its cancel (call it on Character switch). */
export function scheduleBootSync(
  characterId: number,
  sync: (characterId: number) => void
): () => void {
  let cancelled = false;
  const start = () => {
    if (!cancelled) sync(characterId);
  };
  let cancelWait: () => void;
  if (typeof globalThis.requestIdleCallback === 'function') {
    const handle = requestIdleCallback(start, { timeout: BOOT_SYNC_IDLE_TIMEOUT_MS });
    cancelWait = () => cancelIdleCallback(handle);
  } else {
    const handle = setTimeout(start, BOOT_SYNC_IDLE_TIMEOUT_MS);
    cancelWait = () => clearTimeout(handle);
  }
  return () => {
    cancelled = true;
    cancelWait();
  };
}
