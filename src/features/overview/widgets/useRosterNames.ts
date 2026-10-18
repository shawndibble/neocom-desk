import { useSyncExternalStore } from 'react';
import { liveQuery, type Subscription } from 'dexie';
import { db } from '@/db';

/** Character id -> name for every Character on the device; `undefined` until the first read lands. */
type RosterNames = ReadonlyMap<number, string> | undefined;

let snapshot: RosterNames;
let subscription: Subscription | null = null;
const listeners = new Set<() => void>();

function start(): void {
  subscription = liveQuery(() => db.characters.toArray()).subscribe({
    next: (rows) => {
      snapshot = new Map(rows.map((row) => [row.characterId, row.name]));
      for (const listener of listeners) listener();
    },
    // Same as the per-widget `useLiveQuery` it replaces: a failed read leaves the readouts blank.
    error: () => {},
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!subscription) start();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      subscription?.unsubscribe();
      subscription = null;
      snapshot = undefined;
    }
  };
}

/**
 * Every widget header reads the roster. One shared Dexie observer serves them
 * all, instead of two per widget (issue #4099).
 */
export function useRosterNames(): RosterNames {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => undefined
  );
}
