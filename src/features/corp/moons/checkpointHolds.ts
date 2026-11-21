import { useSyncExternalStore } from 'react';

/**
 * Per book, the Miners whose closed month the server would only record with a Director's approval
 * (`recordCheckpoints` skipped them): their accounts are read whole meanwhile, which is no error.
 */
const directorHeld = new Map<number, readonly string[]>();
const heldListeners = new Set<() => void>();
const NONE: readonly string[] = [];

/** The Miners whose checkpoint waits on a Director in this book, as this tab last heard. */
export function useCheckpointsAwaitingDirector(corporationId: number): readonly string[] {
  return useSyncExternalStore(
    (onChange) => {
      heldListeners.add(onChange);
      return () => heldListeners.delete(onChange);
    },
    () => directorHeld.get(corporationId) ?? NONE
  );
}

/** What the last `recordCheckpoints` left for a Director, per book. */
export function noteDirectorHeld(corporationId: number, minerIds: readonly string[]) {
  const before = directorHeld.get(corporationId) ?? NONE;
  if (before.length === minerIds.length && before.every((id, i) => id === minerIds[i])) return;
  directorHeld.set(corporationId, minerIds);
  for (const listener of heldListeners) listener();
}
