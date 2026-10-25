// The server half of the Corp Tax Book's version marker (issue #5047): every
// write under `corps/{id}` restamps that book's versions once the request or
// job that made it is done. See corpTaxBookVersionKeys.ts for the fields.
//
// Why a hook rather than a bump at each write site: about two hundred writes
// across a dozen files reach a book, and a single one forgotten would leave
// officers looking at a stale cache with nothing to tell them. Every Admin SDK
// write — `DocumentReference.set/update/create/delete`, a `Transaction`, a
// `WriteBatch`, a `BulkWriter` and so `recursiveDelete` — is built by
// `WriteBatch.prototype.{create,set,update,delete}`, so recording there sees
// all of them, including ones added later. corpTaxBookVersionTracking.test.ts
// pins that each of those routes really arrives there, so an SDK upgrade that
// changes it fails a test instead of silently stopping the stamps.
//
// The recording is scoped (`withBookVersions`) per callable request and per
// scheduled job, so concurrent requests on one instance never stamp each
// other's books.

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { WriteBatch, type DocumentReference, type Firestore } from 'firebase-admin/firestore';
import {
  BOOK_VERSION_FIELD,
  COLLECTION_VERSIONS_FIELD,
  UNVERSIONED_COLLECTIONS,
  VERSIONED_COLLECTIONS,
  bookPathOf,
} from './corpTaxBookVersionKeys.js';

/** Books written in one scope: corporation id → the subcollections touched. */
type Touched = Map<string, Set<string>>;

const scope = new AsyncLocalStorage<Touched>();
let installed = false;

/** Records one write, if it is a book write inside a scope. */
function record(ref: DocumentReference | undefined): void {
  const touched = scope.getStore();
  if (!touched || typeof ref?.path !== 'string') return;
  const at = bookPathOf(ref.path);
  if (!at || (at.collection !== null && UNVERSIONED_COLLECTIONS.has(at.collection))) return;
  let names = touched.get(at.corporationId);
  if (!names) touched.set(at.corporationId, (names = new Set()));
  if (at.collection !== null) names.add(at.collection);
}

/** Hooks `WriteBatch`'s four write methods. Idempotent. */
export function installBookWriteTracking(): void {
  if (installed) return;
  installed = true;
  const proto = WriteBatch.prototype as unknown as Record<
    string,
    (this: WriteBatch, ref: DocumentReference, ...rest: unknown[]) => WriteBatch
  >;
  for (const method of ['create', 'set', 'update', 'delete']) {
    const original = proto[method];
    proto[method] = function (this: WriteBatch, ref, ...rest) {
      record(ref);
      return original.call(this, ref, ...rest);
    };
  }
}

/** Restamps one book after a scope wrote it; `stampBook` in production. */
export type BookStamper = (corporationId: string, touched: ReadonlySet<string>) => Promise<void>;

/**
 * Runs `run` recording every book write it makes, then restamps each book it
 * wrote — also when `run` throws, since a failure can follow writes that
 * already landed. A stamp that fails is logged and swallowed: the work itself
 * is done, and a client's cache expires on its own (bookCache.ts) so a missed
 * stamp is bounded rather than permanent.
 */
export async function withBookVersions<T>(
  stamp: BookStamper,
  run: () => T | Promise<T>,
  onStampError: (message: string, detail: Record<string, unknown>) => void
): Promise<T> {
  const touched: Touched = new Map();
  try {
    return await scope.run(touched, run);
  } finally {
    // Outside the scope: the stamp is itself a book write and must not record.
    await Promise.all(
      [...touched].map(([corporationId, names]) =>
        stamp(corporationId, names).catch((error: unknown) =>
          onStampError('Corp Tax Book version stamp failed', {
            corporationId,
            error: error instanceof Error ? error.message : String(error),
          })
        )
      )
    );
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
