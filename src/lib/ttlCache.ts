export interface TtlCache<V> {
  get(key: string, load: () => Promise<V | null>): Promise<V | null>;
  delete(key: string): void;
  clear(): void;
}

interface Entry<V> {
  at: number;
  settled: boolean;
  value: Promise<V | null>;
}

export function createTtlCache<V>(options: { ttlMs: number; max: number }): TtlCache<V> {
  const { ttlMs, max } = options;
  const entries = new Map<string, Entry<V>>();

  const fresh = (entry: Entry<V>): boolean => !entry.settled || Date.now() - entry.at < ttlMs;

  return {
    get(key, load) {
      const cached = entries.get(key);
      if (cached && fresh(cached)) return cached.value;
      for (const [oldKey, old] of entries) {
        if (!fresh(old)) entries.delete(oldKey);
      }
      entries.delete(key);
      for (const oldKey of entries.keys()) {
        if (entries.size < max) break;
        entries.delete(oldKey);
      }
      const entry: Entry<V> = {
        at: Date.now(),
        settled: false,
        value: Promise.resolve()
          .then(load)
          .catch(() => null),
      };
      entries.set(key, entry);
      void entry.value.then((value) => {
        entry.settled = true;
        entry.at = Date.now();
        if ((value === null || ttlMs === 0) && entries.get(key) === entry) entries.delete(key);
      });
      return entry.value;
    },
    delete: (key) => {
      entries.delete(key);
    },
    clear: () => entries.clear(),
  };
}
