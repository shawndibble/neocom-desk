/**
 * One concurrency policy for ESI fan-out, so there is a single number to
 * reason about rather than one per call site.
 */

/**
 * Cap on simultaneous ESI requests from a single fan-out. ESI bills against a
 * global error-limit budget and `CLAUDE.md` requires respecting
 * `X-Ratelimit-*`/`Retry-After`, so an unbounded `Promise.all` over a
 * thousand type ids — or over every Character in the roster — is not a
 * theoretical problem.
 */
export const ESI_FANOUT_CONCURRENCY = 10;

/** Runs `fn` over `items`, at most `limit` calls in flight at a time. */
export async function mapWithConcurrencyLimit<T>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      await fn(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
}
