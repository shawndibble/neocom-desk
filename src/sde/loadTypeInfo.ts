import { fetchJsonWithIdleTimeout } from '@/lib/idleTimeout';
import { sdeDataUrl } from './sdeDataUrl';
import { typeInfoShardFile, type TypeInfoRecord, type TypeInfoShard } from './typeInfoShard';

const shards = new Map<string, Promise<TypeInfoShard>>();

function loadShard(file: string): Promise<TypeInfoShard> {
  let promise = shards.get(file);
  if (!promise) {
    promise = fetchJsonWithIdleTimeout<TypeInfoShard>(
      sdeDataUrl(import.meta.env.BASE_URL, file),
      file
    ).catch((err) => {
      shards.delete(file);
      throw err;
    });
    shards.set(file, promise);
  }
  return promise;
}

export async function loadTypeInfo(typeId: number): Promise<TypeInfoRecord | null> {
  const file = typeInfoShardFile(typeId);
  if (file === null) return null;
  const shard = await loadShard(file);
  return shard[String(typeId)] ?? null;
}
