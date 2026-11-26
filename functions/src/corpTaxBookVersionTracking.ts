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

type Touched = Map<string, Set<string>>;

interface Scope {
  pending: Touched;
  timer?: ReturnType<typeof setTimeout>;
  inFlight: Promise<void>[];
  stampAfterMs: number;
  flush: () => Promise<void>;
}

const scope = new AsyncLocalStorage<Scope>();
let installed = false;

export function withoutVersionStamp<T>(fn: () => T): T {
  return scope.exit(fn);
}

function record(ref: { path?: unknown } | undefined): void {
  const current = scope.getStore();
  if (!current || typeof ref?.path !== 'string') return;
  const at = bookPathOf(ref.path);
  if (!at || (at.collection !== null && UNVERSIONED_COLLECTIONS.has(at.collection))) return;
  let names = current.pending.get(at.corporationId);
  if (!names) current.pending.set(at.corporationId, (names = new Set()));
  if (at.collection !== null) names.add(at.collection);
  current.timer ??= setTimeout(() => {
    current.timer = undefined;
    current.inFlight.push(scope.exit(current.flush));
  }, current.stampAfterMs);
}

type Method = (this: unknown, ref: { path?: unknown }, ...rest: unknown[]) => unknown;

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

export function installBookWriteTracking(): void {
  if (installed) return;
  installed = true;
  const writes = ['create', 'set', 'update', 'delete'] as const;
  recordFirstArgument(WriteBatch.prototype, writes);
  recordFirstArgument(BulkWriter.prototype, writes);
  recordFirstArgument(Firestore.prototype, ['recursiveDelete']);
}

export type BookStamper = (corporationId: string, touched: ReadonlySet<string>) => Promise<void>;

export const STAMP_AFTER_MS = 2_000;

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
