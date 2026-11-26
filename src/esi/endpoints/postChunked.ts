import { mapWithConcurrencyLimit } from '@/lib/concurrency';
import { chunk } from '@/lib/chunk';
import { esiFetch } from '../client';
import type { EsiEndpointId } from '../registry';

const POST_BATCH_LIMIT = 1000;

const POST_CHUNK_CONCURRENCY = 2;

export async function postChunked<TIn, TOut>(
  path: string,
  endpointId: EsiEndpointId,
  ids: TIn[],
  signal: AbortSignal | undefined,
  characterId?: number
): Promise<TOut[]> {
  const batches = chunk(ids, POST_BATCH_LIMIT);
  const results: TOut[][] = batches.map(() => []);
  await mapWithConcurrencyLimit(batches, POST_CHUNK_CONCURRENCY, async (batch) => {
    const result = await esiFetch<TOut[]>(path, {
      method: 'POST',
      body: batch,
      signal,
      endpointId,
      ...(characterId === undefined ? {} : { characterId }),
    });
    results[batches.indexOf(batch)] = result.data ?? [];
  });
  return results.flat();
}
