import { describe, expect, it, vi } from 'vitest';
import type { Query, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { indexedPages, isMissingIndex, isTopLevelChild } from './indexedSweep.js';

const doc = (path: string, value: number) =>
  ({ ref: { path }, get: () => value }) as unknown as QueryDocumentSnapshot;

/** A query whose `get` answers from `rows` (or throws `fail`), honouring limit and startAfter. */
function fakeQuery(rows: QueryDocumentSnapshot[], fail?: unknown) {
  const reads: number[] = [];
  const build = (limit = Infinity, after?: QueryDocumentSnapshot): Query =>
    ({
      orderBy: () => build(limit, after),
      limit: (n: number) => build(n, after),
      startAfter: (a: QueryDocumentSnapshot) => build(limit, a),
      get: async () => {
        if (fail) throw fail;
        const start = after ? rows.indexOf(after) + 1 : 0;
        const docs = rows.slice(start, start + limit);
        // Billed: one read per doc returned, and at least one per query.
        reads.push(Math.max(1, docs.length));
        return { docs };
      },
    }) as unknown as Query;
  return { query: build(), reads };
}

async function collect(gen: AsyncGenerator<QueryDocumentSnapshot[]>): Promise<string[][]> {
  const out: string[][] = [];
  for await (const page of gen) out.push(page.map((d) => d.ref.path));
  return out;
}

describe('isMissingIndex', () => {
  it('is the Admin SDK’s gRPC code 9 or the string code, nothing else', () => {
    expect(isMissingIndex({ code: 9 })).toBe(true);
    expect(isMissingIndex({ code: 'failed-precondition' })).toBe(true);
    expect(isMissingIndex({ code: 7 })).toBe(false);
    expect(isMissingIndex(new Error('boom'))).toBe(false);
    expect(isMissingIndex(null)).toBe(false);
  });
});

describe('isTopLevelChild', () => {
  it('keeps only `<top>/{id}/<sub>/{id}`, so a same-named subcollection elsewhere is ignored', () => {
    expect(isTopLevelChild(doc('corps/1/feeders/2', 0), 'corps')).toBe(true);
    expect(isTopLevelChild(doc('characters/u/feeders/2', 0), 'corps')).toBe(false);
    expect(isTopLevelChild(doc('corps/1/x/2/feeders/3', 0), 'corps')).toBe(false);
  });
});

describe('indexedPages', () => {
  it('pages the indexed query and never touches the fallback', async () => {
    const rows = [doc('a/1/s/1', 1), doc('a/1/s/2', 2), doc('a/2/s/3', 3)];
    const { query, reads } = fakeQuery(rows);
    const fallback = vi.fn();
    const pages = await collect(
      indexedPages(query, fallback, { field: 'v', pageSize: 2, label: 'test' })
    );
    expect(pages).toEqual([['a/1/s/1', 'a/1/s/2'], ['a/2/s/3']]);
    expect(reads).toEqual([2, 1]);
    expect(fallback).not.toHaveBeenCalled();
  });

  it('an empty run is one query', async () => {
    const { query, reads } = fakeQuery([]);
    expect(await collect(indexedPages(query, vi.fn(), { field: 'v', label: 'test' }))).toEqual([]);
    expect(reads).toEqual([1]);
  });

  it('falls back to the old scan when the index is not deployed yet', async () => {
    const { query } = fakeQuery([], { code: 9 });
    const log = vi.fn();
    async function* scan() {
      yield [doc('a/1/s/9', 9)];
    }
    const pages = await collect(
      indexedPages(query, scan, { field: 'v', label: 'test', warn: log })
    );
    expect(pages).toEqual([['a/1/s/9']]);
    expect(log).toHaveBeenCalledOnce();
  });

  it('any other error is not swallowed', async () => {
    const { query } = fakeQuery([], new Error('unavailable'));
    await expect(
      collect(indexedPages(query, vi.fn(), { field: 'v', label: 'test' }))
    ).rejects.toThrow('unavailable');
  });
});
