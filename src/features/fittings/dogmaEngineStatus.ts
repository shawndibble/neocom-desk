/**
 * Where the dogma engine's download stands: nothing asked for it yet (`idle`),
 * on its way (`loading`), in (`ready`) or refused (`failed`: offline on a
 * first visit, a stalled or bad response). Its own tiny module, apart from
 * `dogmaFittingEngine.ts`, so the engine can publish without a cycle. React-free
 * on purpose: the hull-fit worker imports the engine, and so this, and must not
 * pull React into its bundle (the hooks are in `useDogmaEngineStatus.ts`).
 *
 * `failed` stays up until the next attempt starts; a page that wants the
 * engine back calls `warmDogmaEngine()` again (a Retry, or `onReconnect`).
 */
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
