// Scheduled sweeps over a subcollection that every parent doc has (Community
// Requests, Fleet Payouts, SRP Claims, Corp Tax Book feeders). Querying once
// per parent costs one billed read per parent even when nothing matches, plus
// the parent listing itself, every run. A collection-group query costs one
// read when empty. Its index is in firestore.indexes.json, but indexes are
// deployed by hand: until then the query fails with FAILED_PRECONDITION, and
// the sweep falls back to the old per-parent scan rather than failing.

import { warn as logWarn } from 'firebase-functions/logger';
import type { Query, QueryDocumentSnapshot } from 'firebase-admin/firestore';

/** A query that needs an index not deployed yet: gRPC FAILED_PRECONDITION (the Admin SDK's numeric 9). */
export function isMissingIndex(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return code === 9 || code === 'failed-precondition';
}

/**
 * `<topLevel>/{id}/<sub>/{id}` only. A collection group spans every
 * subcollection with that name anywhere in the database, so a same-named one
 * elsewhere must not be swept.
 */
export function isTopLevelChild(doc: QueryDocumentSnapshot, topLevel: string): boolean {
  const segments = doc.ref.path.split('/');
  return segments.length === 4 && segments[0] === topLevel;
}

/** Every document a query matches, one page at a time, ordered by `field`. */
export async function* pages(
  base: Query,
  field: string,
  pageSize: number
): AsyncGenerator<QueryDocumentSnapshot[]> {
  let after: QueryDocumentSnapshot | undefined;
  for (;;) {
    let page = base.orderBy(field).limit(pageSize);
    if (after) page = page.startAfter(after);
    const found = (await page.get()).docs;
    if (found.length === 0) return;
    yield found;
    if (found.length < pageSize) return;
    after = found[found.length - 1];
  }
}

/**
 * `pages` of the indexed (collection-group) query, or of `fallback` when its
 * index is missing. Only the first page can fail that way, so nothing is ever
 * yielded twice.
 */
export async function* indexedPages(
  indexed: Query,
  fallback: () => AsyncGenerator<QueryDocumentSnapshot[]>,
  opts: {
    field: string;
    pageSize?: number;
    label: string;
    warn?: (message: string, data: Record<string, unknown>) => void;
  }
): AsyncGenerator<QueryDocumentSnapshot[]> {
  const it = pages(indexed, opts.field, opts.pageSize ?? 100);
  let first: IteratorResult<QueryDocumentSnapshot[]>;
  try {
    first = await it.next();
  } catch (err) {
    if (!isMissingIndex(err)) throw err;
    (opts.warn ?? logWarn)('Collection-group index not deployed yet; using the per-parent scan', {
      sweep: opts.label,
    });
    yield* fallback();
    return;
  }
  if (first.done) return;
  yield first.value;
  yield* it;
}
