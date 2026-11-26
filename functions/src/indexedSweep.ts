import { warn as logWarn } from 'firebase-functions/logger';
import type { Query, QueryDocumentSnapshot } from 'firebase-admin/firestore';

export function isMissingIndex(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return code === 9 || code === 'failed-precondition';
}

export function isTopLevelChild(doc: QueryDocumentSnapshot, topLevel: string): boolean {
  const segments = doc.ref.path.split('/');
  return segments.length === 4 && segments[0] === topLevel;
}

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
