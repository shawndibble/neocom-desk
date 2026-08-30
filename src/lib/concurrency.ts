/**
 * One ESI fan-out policy, so there is a single number to tune. ESI bills
 * against a global error-limit budget and `CLAUDE.md` requires respecting
 * `X-Ratelimit-*`/`Retry-After`, so an unbounded `Promise.all` over a thousand
 * type ids — or every Character in the roster — is not theoretical.
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
