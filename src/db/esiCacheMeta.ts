import type { DBCore, DBCoreMutateRequest, DBCoreTable, Middleware } from 'dexie';

const ESI_CACHE_TABLE = 'esiCache';
const ESI_CACHE_META_TABLE = 'esiCacheMeta';

export interface CachedPage {
  etag: string;
  count: number;
}

export interface EsiCacheMetaRecord {
  characterId: number;
  key: string;
  fetchedAt: number;
  truncated?: boolean;
  expiresAt?: number;
  etag?: string;
  pages?: CachedPage[];
}

export function metaOf(row: {
  characterId: number;
  key: string;
  fetchedAt: number;
  truncated?: boolean;
  expiresAt?: number;
  etag?: string;
  pages?: CachedPage[];
}): EsiCacheMetaRecord {
  const meta: EsiCacheMetaRecord = {
    characterId: row.characterId,
    key: row.key,
    fetchedAt: row.fetchedAt,
  };
  if (row.truncated !== undefined) meta.truncated = row.truncated;
  if (row.expiresAt !== undefined) meta.expiresAt = row.expiresAt;
  if (row.etag !== undefined) meta.etag = row.etag;
  if (row.pages !== undefined) meta.pages = row.pages;
  return meta;
}

function mirrorRequest(req: DBCoreMutateRequest): DBCoreMutateRequest {
  switch (req.type) {
    case 'add':
    case 'put':
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
            if (!hasMetaStore(req.trans)) return table.mutate(req);
            const meta: DBCoreTable = down.table(ESI_CACHE_META_TABLE);
            const mirror = mirrorRequest(req);
            if (req.type === 'add' && mirror.type === 'put') {
              return table.mutate(req).then((result) => {
                const values = mirror.values.filter((_, i) => !(i in result.failures));
                if (values.length === 0) return result;
                return meta.mutate({ ...mirror, values }).then(() => result);
              });
            }
            const mirrored = meta.mutate(mirror);
            const result = table.mutate(req);
            return Promise.all([result, mirrored]).then(([valueResult]) => valueResult);
          },
        };
      },
    };
  },
};
