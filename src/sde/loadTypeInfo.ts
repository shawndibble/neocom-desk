import { fetchJsonWithIdleTimeout } from '@/lib/idleTimeout';
import { sdeDataUrl } from './sdeDataUrl';
import { typeInfoShardFile, type TypeInfoRecord, type TypeInfoShard } from './typeInfoShard';

/**
 * Own module, not a `loadSde.ts` export: one memo per shard file, and tests
 * mocking `loadSde.ts` wholesale stay unaffected.
 */
const shards = new Map<string, Promise<TypeInfoShard>>();

function loadShard(file: string): Promise<TypeInfoShard> {
  let promise = shards.get(file);
  if (!promise) {
    promise = fetchJsonWithIdleTimeout<TypeInfoShard>(
      sdeDataUrl(import.meta.env.BASE_URL, file),
      file
    ).catch((err) => {
      shards.delete(file); // allow retry after failure, as loadSde's `cached()`
      throw err;
    });
    shards.set(file, promise);
  }
  return promise;
}

/**
 * A published type's baked data from its shard. Null if the shard lacks it, or
 * the id is past the last shard (no fetch); rejects if the shard can't be
 * fetched.
 */
export async function loadTypeInfo(typeId: number): Promise<TypeInfoRecord | null> {
  const file = typeInfoShardFile(typeId);
  if (file === null) return null;
  const shard = await loadShard(file);
  return shard[String(typeId)] ?? null;
}
