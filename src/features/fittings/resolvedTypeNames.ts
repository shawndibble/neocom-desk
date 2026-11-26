import { useSyncExternalStore } from 'react';
import { loadTypeNames } from '@/features/character/typeNames';

export type ResolvedTypeNames = ReadonlyMap<number, string>;

const requested = new Set<number>();
const listeners = new Set<() => void>();
let snapshot: ResolvedTypeNames = new Map();

export function resolvedTypeNames(): ResolvedTypeNames {
  return snapshot;
}

export function useResolvedTypeNames(): ResolvedTypeNames {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    resolvedTypeNames,
    resolvedTypeNames
  );
}

export function resolveTypeNames(typeIds: Iterable<number>): void {
  const fresh = [...new Set(typeIds)].filter((id) => !requested.has(id));
  if (fresh.length === 0) return;
  for (const id of fresh) requested.add(id);
  loadTypeNames(fresh).then(
    (found) => {
      const next = new Map(snapshot);
      for (const [id, name] of found) if (name !== `Type #${id}`) next.set(id, name);
      if (next.size === snapshot.size) return;
      snapshot = next;
      for (const listener of [...listeners]) listener();
    },
    () => {
      for (const id of fresh) requested.delete(id);
    }
  );
}

export function resetResolvedTypeNames(): void {
  requested.clear();
  snapshot = new Map();
}
