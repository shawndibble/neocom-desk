import { useSyncExternalStore } from 'react';
import { liveQuery, type Subscription } from 'dexie';
import { db } from '@/db';

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

export function useRosterNames(): RosterNames {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => undefined
  );
}
