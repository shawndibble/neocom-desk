/**
 * A keyed async cache: reuses an answer for `ttlMs`, shares one in-flight load
 * between concurrent callers, and holds at most `max` entries (expired first,
 * then oldest). A load that resolves `null` or throws is a failure and is never kept.
 * `ttlMs: 0` dedupes concurrent callers only; nothing is reused once settled.
 */
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
      // Expired first, then the oldest, until there is room (a Map keeps insertion order).
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
