export interface UpgradeBlockedEvent {
  oldVersion: number;
  newVersion: number | null;
}

type Listener = (event: UpgradeBlockedEvent) => void;

const listeners = new Set<Listener>();

export function onUpgradeBlocked(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitUpgradeBlocked(event: UpgradeBlockedEvent): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {}
  }
}
