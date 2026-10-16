/**
 * Where the dogma engine's download stands: nothing asked for it yet (`idle`),
 * on its way (`loading`), in (`ready`) or refused (`failed`: offline on a
 * first visit, a stalled or bad response). Its own tiny module, apart from
 * `dogmaFittingEngine.ts`, so a view can say "failed" without importing the
 * engine and the engine can publish without a cycle.
 *
 * `failed` stays up until the next attempt starts; a page that wants the
 * engine back calls `loadDogmaEngine()` again (a Retry, or `onReconnect`).
 */
import { useSyncExternalStore } from 'react';

export type DogmaEngineStatus = 'idle' | 'loading' | 'ready' | 'failed';

let status: DogmaEngineStatus = 'idle';
const listeners = new Set<() => void>();

export function dogmaEngineStatus(): DogmaEngineStatus {
  return status;
}

/** Engine-only: records a transition and tells subscribers. A repeat is a no-op. */
export function setDogmaEngineStatus(next: DogmaEngineStatus): void {
  if (status === next) return;
  status = next;
  for (const listener of [...listeners]) listener();
}

export function subscribeDogmaEngineStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** The engine's load status, re-rendering as it changes. */
export function useDogmaEngineStatus(): DogmaEngineStatus {
  return useSyncExternalStore(subscribeDogmaEngineStatus, dogmaEngineStatus, dogmaEngineStatus);
}
