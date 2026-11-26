export interface ReadCache<V> {
  get(key: string, fresh: (stamp: number) => boolean): Promise<V> | undefined;
  set(key: string, stamp: number, value: Promise<V>): Promise<V>;
  drop(prefix?: string): void;
}

const registry = new Set<ReadCache<unknown>>();

export function createReadCache<V>(): ReadCache<V> {
  const entries = new Map<string, { stamp: number; value: Promise<V> }>();
  const cache: ReadCache<V> = {
    get(key, fresh) {
      const held = entries.get(key);
      return held && fresh(held.stamp) ? held.value : undefined;
    },
    set(key, stamp, value) {
      const entry = { stamp, value };
      entries.set(key, entry);
      value.catch(() => {
        if (entries.get(key) === entry) entries.delete(key);
      });
      return value;
    },
    drop(prefix) {
      if (prefix === undefined) entries.clear();
      else for (const key of [...entries.keys()]) if (key.startsWith(prefix)) entries.delete(key);
    },
  };
  registry.add(cache as ReadCache<unknown>);
  return cache;
}

export function dropCached(characterId?: number): void {
  const prefix = characterId === undefined ? undefined : `${characterId}:`;
  for (const cache of registry) cache.drop(prefix);
}
