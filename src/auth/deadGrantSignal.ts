type DeadGrantListener = (characterId: number) => void;

const listeners = new Set<DeadGrantListener>();

export function onDeadGrant(listener: DeadGrantListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitDeadGrant(characterId: number): void {
  for (const listener of listeners) {
    try {
      listener(characterId);
    } catch {}
  }
}
