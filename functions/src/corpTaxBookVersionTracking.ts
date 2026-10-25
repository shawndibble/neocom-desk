// The server half of the Corp Tax Book's version marker (issue #5047): every
// write under `corps/{id}` restamps that book's versions once the request or
// job that made it is done. See corpTaxBookVersionKeys.ts for the fields.
//
// Why a hook rather than a bump at each write site: about two hundred writes
// across a dozen files reach a book, and a single one forgotten would leave
// officers looking at a stale cache with nothing to tell them. Every Admin SDK
// write — `DocumentReference.set/update/create/delete`, a `Transaction`, a
// `WriteBatch` — is built by `WriteBatch.prototype.{create,set,update,delete}`,
// so recording there sees all of them, including ones added later.
//
// Two routes can build that write later, outside the caller's async context: a
// `BulkWriter` buffers operations past its pending limit and builds them from
// another operation's completion, and `recursiveDelete` streams its deletes
// into the instance's shared BulkWriter. So `BulkWriter`'s four methods and
// `Firestore.recursiveDelete` are recorded where they are *called* as well.
// corpTaxBookVersionTracking.test.ts pins each route, so an SDK upgrade that
// changes one fails a test instead of silently stopping the stamps.
//
// The recording is scoped (`withBookVersions`) per callable request and per
// scheduled job, so concurrent requests on one instance never stamp each
// other's books.

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { BulkWriter, Firestore, WriteBatch } from 'firebase-admin/firestore';
import {
  BOOK_VERSION_FIELD,
  COLLECTION_VERSIONS_FIELD,
  UNVERSIONED_COLLECTIONS,
  VERSIONED_COLLECTIONS,
  bookPathOf,
} from './corpTaxBookVersionKeys.js';

/** Books written in one scope: corporation id → the subcollections touched. */
type Touched = Map<string, Set<string>>;

/** One request's or job's recording, and the stamps it has started. */
interface Scope {
  /** Written since the last stamp. */
  pending: Touched;
  /** A stamp due soon, armed by the first write after the last one. */
  timer?: ReturnType<typeof setTimeout>;
  inFlight: Promise<void>[];
  stampAfterMs: number;
  flush: () => Promise<void>;
}

const scope = new AsyncLocalStorage<Scope>();
let installed = false;

/** Records one write, if it is a book write inside a scope. */
function record(ref: { path?: unknown } | undefined): void {
  const current = scope.getStore();
  if (!current || typeof ref?.path !== 'string') return;
  const at = bookPathOf(ref.path);
  if (!at || (at.collection !== null && UNVERSIONED_COLLECTIONS.has(at.collection))) return;
  let names = current.pending.get(at.corporationId);
  if (!names) current.pending.set(at.corporationId, (names = new Set()));
  if (at.collection !== null) names.add(at.collection);
  // A long job (the scheduled sync runs every book in one scope, for minutes)
  // must not hold a book's stamp until its end, nor lose it to a timeout:
  // stamp shortly after the writes, and again for any that follow.
  current.timer ??= setTimeout(() => {
    current.timer = undefined;
    // Outside the scope: the stamp is itself a book write and must not record.
    current.inFlight.push(scope.exit(current.flush));
  }, current.stampAfterMs);
}

type Method = (this: unknown, ref: { path?: unknown }, ...rest: unknown[]) => unknown;

/** Wraps `methods` of `proto` so each records its first argument before running. */
function recordFirstArgument(proto: object, methods: readonly string[]): void {
  const table = proto as Record<string, Method>;
  for (const method of methods) {
    const original = table[method];
    table[method] = function (this: unknown, ref, ...rest) {
      record(ref);
      return original.call(this, ref, ...rest);
    };
  }
}

/** Hooks every Admin SDK write route (see the header). Idempotent. */
export function installBookWriteTracking(): void {
  if (installed) return;
  installed = true;
  const writes = ['create', 'set', 'update', 'delete'] as const;
  recordFirstArgument(WriteBatch.prototype, writes);
  recordFirstArgument(BulkWriter.prototype, writes);
  recordFirstArgument(Firestore.prototype, ['recursiveDelete']);
}

/** Restamps one book after a scope wrote it; `stampBook` in production. */
export type BookStamper = (corporationId: string, touched: ReadonlySet<string>) => Promise<void>;

/** How long after a book write its stamp follows, inside a scope still running. */
export const STAMP_AFTER_MS = 2_000;

/**
 * Runs `run` recording every book write it makes, and restamps each book it
 * wrote: {@link STAMP_AFTER_MS} after a write while `run` is still going, and
 * once more at the end for whatever is left — also when `run` throws, since a
 * failure can follow writes that already landed. A stamp that fails is logged
 * and swallowed: the work itself is done, and a client's copy expires on its
 * own (bookCache.ts), so a missed stamp is bounded rather than permanent.
 */
export async function withBookVersions<T>(
  stamp: BookStamper,
  run: () => T | Promise<T>,
  onStampError: (message: string, detail: Record<string, unknown>) => void,
  stampAfterMs = STAMP_AFTER_MS
): Promise<T> {
  const current: Scope = {
    pending: new Map(),
    inFlight: [],
    stampAfterMs,
    flush: async () => {
      const due = current.pending;
      current.pending = new Map();
      await Promise.all(
        [...due].map(([corporationId, names]) =>
          stamp(corporationId, names).catch((error: unknown) =>
            onStampError('Corp Tax Book version stamp failed', {
              corporationId,
              error: error instanceof Error ? error.message : String(error),
            })
          )
        )
      );
    },
  };
  try {
    return await scope.run(current, run);
  } finally {
    clearTimeout(current.timer);
    current.timer = undefined;
    await Promise.all(current.inFlight);
    await current.flush();
  }
}

/**
 * Restamps one book: a fresh `bookVersion`, and a fresh stamp for each touched
 * subcollection — for every versioned one when the book has no `bookVersion`
 * yet (see `VERSIONED_COLLECTIONS`). A deleted book is left deleted.
 */
export async function stampBook(
  db: Firestore,
  corporationId: string,
  touched: ReadonlySet<string>
): Promise<void> {
  const ref = db.collection('corps').doc(corporationId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const first = typeof snap.get(BOOK_VERSION_FIELD) !== 'string';
    const names = first ? new Set([...VERSIONED_COLLECTIONS, ...touched]) : touched;
    const update: Record<string, string> = { [BOOK_VERSION_FIELD]: randomUUID() };
    for (const name of names) update[`${COLLECTION_VERSIONS_FIELD}.${name}`] = randomUUID();
    tx.update(ref, update);
  });
}
