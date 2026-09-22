/**
 * First occurrence of each `transaction_id`, order kept. The transaction cursor
 * walk in `endpoints.ts` applies it as it goes; the loaders apply it again on the way out,
 * because lists cached before that fix still carry repeats and a fresh
 * cached row is served without a fetch.
 *
 * Its own module because every export of `endpoints.ts` is taken to be an
 * ESI wrapper (`registry.test.ts`).
 */
export function uniqueTransactions<T extends { transaction_id: number }>(rows: readonly T[]): T[] {
  const seen = new Set<number>();
  return rows.filter((row) => {
    if (seen.has(row.transaction_id)) return false;
    seen.add(row.transaction_id);
    return true;
  });
}
