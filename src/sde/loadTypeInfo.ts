import { fetchJsonWithIdleTimeout } from '@/lib/idleTimeout';
import { sdeDataUrl } from './sdeDataUrl';
import { typeInfoShardFile, type TypeInfoRecord, type TypeInfoShard } from './typeInfoShard';

/**
 * Its own module rather than a `loadSde.ts` export: one memo per shard file,
 * not one per file name known up front, and the many tests that mock
 * `loadSde.ts` wholesale stay unaffected.
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
 * A published type's baked Item Detail data (issue #3882), from its
 * `typeInfo/<n>.json` shard. Null for a type the shard doesn't carry
 * (unpublished, or newer than the build), and with no fetch for an id past
 * the last shard; rejects when the shard itself can't be fetched.
 */
export async function loadTypeInfo(typeId: number): Promise<TypeInfoRecord | null> {
  const file = typeInfoShardFile(typeId);
  if (file === null) return null;
  const shard = await loadShard(file);
  return shard[String(typeId)] ?? null;
}
