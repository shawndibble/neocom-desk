import { mapWithConcurrencyLimit } from '@/lib/concurrency';
import { chunk } from '@/lib/chunk';
import { esiFetch } from '../client';
import type { EsiEndpointId } from '../registry';

/** ESI's documented cap on ids per request (maxItems in the spec) for the bulk-lookup POSTs. */
const POST_BATCH_LIMIT = 1000;

/** Batches in flight at once: ESI bills errors against a shared budget, so stay small. */
const POST_CHUNK_CONCURRENCY = 2;

/**
 * POSTs `ids` to a bulk-lookup endpoint in `POST_BATCH_LIMIT`-sized batches, a
 * couple at a time, and returns the results in batch order. `characterId`
 * makes the call authenticated (assets names); absent it is public.
 */
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
