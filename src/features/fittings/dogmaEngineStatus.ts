export type DogmaEngineStatus = 'idle' | 'loading' | 'ready' | 'failed';

let status: DogmaEngineStatus = 'idle';
const listeners = new Set<() => void>();

export function dogmaEngineStatus(): DogmaEngineStatus {
  return status;
}

export function setDogmaEngineStatus(next: DogmaEngineStatus): void {
  if (status === next) return;
  status = next;
  for (const listener of [...listeners]) listener();
}

export function subscribeDogmaEngineStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
