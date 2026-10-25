/**
 * In-memory caches of Community reads (issue #5051). Firestore here is the `lite`
 * build: no cache of its own, and every document a read returns is billed, so a
 * roster or a library read on every mount adds up.
 *
 * Every entry is keyed `${characterId}:…`, so everything one Character holds can
 * be dropped at once (`dropCached`): `invalidateMyCommunities` does that after a
 * change to its memberships, and whenever a Community refuses it.
 */

export interface ReadCache<V> {
  /** The kept read for `key`, if `fresh` accepts its stamp. */
  get(key: string, fresh: (stamp: number) => boolean): Promise<V> | undefined;
  /** Keep `value` under `key`, stamped (when it was read, or the version it read). */
  set(key: string, stamp: number, value: Promise<V>): Promise<V>;
  /** Drop every entry whose key starts with `prefix`, or every entry. */
  drop(prefix?: string): void;
}

const registry = new Set<ReadCache<unknown>>();

/**
 * Concurrent callers share the read in flight; a failed read is never kept, and one
 * dropped while in flight stays dropped.
 */
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

/** Drop what every Community cache holds for one Character, or everything. */
export function dropCached(characterId?: number): void {
  const prefix = characterId === undefined ? undefined : `${characterId}:`;
  for (const cache of registry) cache.drop(prefix);
}
