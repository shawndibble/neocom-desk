/**
 * `esiCacheMeta`: every `esiCache` row's freshness fields, without its value.
 *
 * A cached value can be megabytes (a veteran's assets, a wallet journal), and
 * IndexedDB hands a row back only by deserializing all of it on the main
 * thread — ~20 ms for 20k assets. Every freshness check used to pay that just
 * to read `fetchedAt`/`expiresAt`, on every route mount, prefetch task and poll.
 * `esi/cache.ts` answers "is it fresh?" from this table instead and touches the
 * value only when it is actually going to hand it to a caller.
 *
 * Kept in step by a DBCore middleware rather than by each writer, because the
 * writers are not all in one place: `esi/cache.ts`, the privacy purges, the
 * Settings "clear cache" button, the mail-send invalidation, and ~100 test
 * files that seed or clear `esiCache` directly. Below all of them, every
 * `esiCache` put/add/delete/range-delete/clear is mirrored onto meta **in the
 * same IndexedDB transaction** — any transaction that touches `esiCache` is
 * widened to include `esiCacheMeta` — so the two commit or roll back together
 * and no path can leave an orphan. The one intentional divergence is a 304
 * revalidation (`esi/cache.ts`), which bumps meta alone because the value did
 * not change.
 *
 * There is no `upgrade()` backfill: that would deserialize every value at
 * open, before first render — the cost this exists to remove. A row without
 * meta (written before this table existed) is read the old way once and its
 * meta written then.
 */
import type { DBCore, DBCoreMutateRequest, DBCoreTable, Middleware } from 'dexie';

export const ESI_CACHE_TABLE = 'esiCache';
export const ESI_CACHE_META_TABLE = 'esiCacheMeta';

export interface EsiCacheMetaRecord {
  characterId: number;
  key: string;
  fetchedAt: number;
  truncated?: boolean;
  expiresAt?: number;
  /** The response's ETag, sent back as If-None-Match on the next live call. */
  etag?: string;
}

/** The meta row for one `esiCache` row — every field but `value`. */
export function metaOf(row: {
  characterId: number;
  key: string;
  fetchedAt: number;
  truncated?: boolean;
  expiresAt?: number;
  etag?: string;
}): EsiCacheMetaRecord {
  const meta: EsiCacheMetaRecord = {
    characterId: row.characterId,
    key: row.key,
    fetchedAt: row.fetchedAt,
  };
  if (row.truncated !== undefined) meta.truncated = row.truncated;
  if (row.expiresAt !== undefined) meta.expiresAt = row.expiresAt;
  if (row.etag !== undefined) meta.etag = row.etag;
  return meta;
}

/** The same mutation, re-aimed at the meta store. */
function mirrorRequest(req: DBCoreMutateRequest): DBCoreMutateRequest {
  switch (req.type) {
    case 'add':
    case 'put':
      // Always a plain put: an `add` that would collide already failed on the
      // value store, and meta for a Collection.modify is the full new row.
      return { type: 'put', trans: req.trans, values: req.values.map(metaOf) };
    case 'delete':
      return { type: 'delete', trans: req.trans, keys: req.keys };
    case 'deleteRange':
      return { type: 'deleteRange', trans: req.trans, range: req.range };
  }
}

function hasMetaStore(trans: unknown): boolean {
  const names = (trans as IDBTransaction).objectStoreNames;
  return names !== undefined && names.contains(ESI_CACHE_META_TABLE);
}

export const esiCacheMetaMiddleware: Middleware<DBCore> = {
  stack: 'dbcore',
  name: 'esiCacheMeta',
  create(down) {
    const hasMetaTable = (): boolean =>
      down.schema.tables.some((table) => table.name === ESI_CACHE_META_TABLE);
    return {
      ...down,
      transaction(stores, mode, options) {
        const widened =
          stores.includes(ESI_CACHE_TABLE) &&
          !stores.includes(ESI_CACHE_META_TABLE) &&
          hasMetaTable()
            ? [...stores, ESI_CACHE_META_TABLE]
            : stores;
        return down.transaction(widened, mode, options);
      },
      table(name) {
        const table = down.table(name);
        if (name !== ESI_CACHE_TABLE) return table;
        return {
          ...table,
          mutate(req) {
            // Absent only mid-upgrade from a version without the table.
            if (!hasMetaStore(req.trans)) return table.mutate(req);
            const meta: DBCoreTable = down.table(ESI_CACHE_META_TABLE);
            const mirror = mirrorRequest(req);
            if (req.type === 'add' && mirror.type === 'put') {
              // An `add` can be refused per row (key collision), so its meta
              // waits for the verdict. Chained with `.then` on the IndexedDB
              // layer's own promise, never `await`: a native-promise hop can
              // let the transaction auto-commit first.
              return table.mutate(req).then((result) => {
                const values = mirror.values.filter((_, i) => !(i in result.failures));
                if (values.length === 0) return result;
                return meta.mutate({ ...mirror, values }).then(() => result);
              });
            }
            // Both issued synchronously, in one transaction: they commit or
            // roll back together.
            const mirrored = meta.mutate(mirror);
            const result = table.mutate(req);
            return Promise.all([result, mirrored]).then(([valueResult]) => valueResult);
          },
        };
      },
    };
  },
};
