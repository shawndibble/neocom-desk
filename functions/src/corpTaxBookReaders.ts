// Who reads a Corp Tax Book's copied records (decision 20261121-093000): each `observed` row and
// each payment carries `uids`, a copy of who may read it, because the rules cannot follow a
// Character to its grouping. A copy goes stale whenever a grouping changes. One Character can hold
// thousands of rows, more than a transaction writes, so an action that changes readers writes a
// durable marker in its own transaction (`markReadersDirty`), and the drain (`drainReaders`)
// rewrites the copies afterwards: right after the action, after every sync, and nightly, until
// the marker is empty.

import {
  FieldPath,
  FieldValue,
  type DocumentReference,
  type Firestore,
  type QueryDocumentSnapshot,
  type Transaction,
} from 'firebase-admin/firestore';
import { characterUids, minerUidsOf, paymentUids, type ReaderMiner } from './corpTaxBookClaims.js';
import {
  MINERS,
  OBSERVED,
  OBSERVED_UPDATED_AT_FIELD,
  PAYMENTS,
  READERS_QUEUE,
} from './corpTaxBookVersionKeys.js';

/** `corps/{id}/readersQueue/pending`: the Characters and Miners whose copies still need a rewrite. */
const PENDING_DOC = 'pending';
/** Field on `corps/{id}`: bumped whenever a drain takes a reader off a record (or the backfill
 * repairs one), so a client's delta read starts over rather than keep what it may no longer read. */
export const READERS_EPOCH_FIELD = 'readersEpoch';

/** How many records one page of the drain reads and writes. */
export const READERS_PAGE = 400;

const sub = (db: Firestore, corporationId: number, name: string) =>
  db.collection('corps').doc(String(corporationId)).collection(name);

/** Whether a stored `uids` holds exactly these readers. */
export function sameReaders(held: unknown, uids: readonly string[]): boolean {
  return Array.isArray(held) && held.length === uids.length && uids.every((u) => held.includes(u));
}

/** Whether going from `held` to `uids` takes a reader off (a client may hold what it can't read). */
export function narrows(held: unknown, uids: readonly string[]): boolean {
  return Array.isArray(held) && held.some((u) => !uids.includes(u as string));
}

/** The book's groupings, as `characterUids` reads them. */
export async function readerMinersOf(db: Firestore, corporationId: number): Promise<ReaderMiner[]> {
  const snap = await sub(db, corporationId, MINERS)
    .select('characterIds', 'officerClaimed', 'pendingConfirmation', 'createdAt')
    .get();
  return snap.docs.map((d) => ({
    id: d.id,
    characterIds: (d.get('characterIds') as number[] | undefined) ?? [],
    officerClaimed: d.get('officerClaimed') as number[] | undefined,
    pendingConfirmation: d.get('pendingConfirmation') as number[] | undefined,
    ...(typeof d.get('createdAt') === 'string' ? { createdAt: d.get('createdAt') as string } : {}),
  }));
}

/** `characterUids` over one read of the groupings, once per Character. */
export function rowReadersFrom(miners: readonly ReaderMiner[]): (characterId: number) => string[] {
  const memo = new Map<number, string[]>();
  return (characterId) => {
    let uids = memo.get(characterId);
    if (!uids) memo.set(characterId, (uids = characterUids(characterId, miners)));
    return uids;
  };
}

/** Whose copies an action changed: the Characters (their rows) and the Miners (their payments). */
export interface DirtyReaders {
  characters: Iterable<number>;
  miners: Iterable<string>;
}

/**
 * Marks these Characters' rows and these Miners' payments for a rewrite, in the caller's
 * transaction (a write: call it after the transaction's reads). Each entry gets a fresh nonce, so
 * a drain that started before this mark does not clear it.
 */
export function markReadersDirty(
  tx: Transaction,
  db: Firestore,
  corporationId: number,
  dirty: DirtyReaders,
  now: number
): void {
  const characters = [...new Set(dirty.characters)];
  const miners = [...new Set(dirty.miners)];
  if (characters.length === 0 && miners.length === 0) return;
  const nonce = `${now}_${Math.random().toString(36).slice(2, 8)}`;
  tx.set(
    sub(db, corporationId, READERS_QUEUE).doc(PENDING_DOC),
    {
      characters: Object.fromEntries(characters.map((c) => [String(c), nonce])),
      miners: Object.fromEntries(miners.map((m) => [m, nonce])),
    },
    { merge: true }
  );
}

type Entry = { kind: 'characters' | 'miners'; id: string; nonce: string };

/** One page of copies brought level; false when a record changed under it (try again later). */
async function writePage(
  db: Firestore,
  page: readonly QueryDocumentSnapshot[],
  want: (d: QueryDocumentSnapshot) => string[]
): Promise<{ ok: boolean; written: number; narrowed: boolean }> {
  const stale = page.flatMap((d) => {
    const uids = want(d);
    return sameReaders(d.get('uids'), uids) ? [] : [{ d, uids }];
  });
  if (stale.length === 0) return { ok: true, written: 0, narrowed: false };
  const batch = db.batch();
  for (const { d, uids } of stale)
    batch.update(
      d.ref,
      { uids, [OBSERVED_UPDATED_AT_FIELD]: FieldValue.serverTimestamp() },
      { lastUpdateTime: d.updateTime }
    );
  try {
    await batch.commit();
  } catch (e) {
    // A record written meanwhile (a sync, an officer's placement): its batch is left for next time.
    if ((e as { code?: number }).code === 9) return { ok: false, written: 0, narrowed: false };
    throw e;
  }
  return {
    ok: true,
    written: stale.length,
    narrowed: stale.some(({ d, uids }) => narrows(d.get('uids'), uids)),
  };
}

/**
 * Rewrites the copies the marker names, a page of `READERS_PAGE` at a time, re-reading the
 * groupings for each page and guarding each write with the record's update time; every record it
 * changes gets a fresh `updatedAt`. An entry is cleared only once all of its records are level and
 * nobody marked it again meanwhile. Stops after `budget` writes; what is left waits for the next
 * run. Idempotent. Returns how many records it wrote and how many entries are left.
 */
export async function drainReaders(
  db: Firestore,
  corporationId: number,
  budget = 2000
): Promise<{ written: number; left: number }> {
  const pendingRef = sub(db, corporationId, READERS_QUEUE).doc(PENDING_DOC);
  const held = (await pendingRef.get()).data() ?? {};
  const entries: Entry[] = (['characters', 'miners'] as const).flatMap((kind) =>
    Object.entries((held[kind] as Record<string, string> | undefined) ?? {}).map(([id, nonce]) => ({
      kind,
      id,
      nonce,
    }))
  );
  let written = 0;
  let narrowed = false;
  let left = entries.length;
  for (const entry of entries) {
    if (written >= budget) break;
    const query =
      entry.kind === 'characters'
        ? sub(db, corporationId, OBSERVED).where('characterId', '==', Number(entry.id))
        : sub(db, corporationId, PAYMENTS).where('minerId', '==', entry.id);
    let after: QueryDocumentSnapshot | undefined;
    let done = true;
    for (;;) {
      if (written >= budget) {
        done = false;
        break;
      }
      let q = query.orderBy(FieldPath.documentId()).select('uids', 'uid').limit(READERS_PAGE);
      if (after) q = q.startAfter(after);
      const [page, miners] = await Promise.all([q.get(), readerMinersOf(db, corporationId)]);
      const want =
        entry.kind === 'characters'
          ? () => characterUids(Number(entry.id), miners)
          : (d: QueryDocumentSnapshot) =>
              paymentUids(
                minerUidsOf(
                  entry.id,
                  miners.find((m) => m.id === entry.id)
                ),
                d.get('uid')
              );
      const out = await writePage(db, page.docs, want);
      written += out.written;
      narrowed ||= out.narrowed;
      if (!out.ok) {
        done = false;
        break;
      }
      if (page.size < READERS_PAGE) break;
      after = page.docs[page.size - 1];
    }
    if (done && (await clearEntry(db, pendingRef, entry))) left -= 1;
  }
  if (narrowed)
    await db
      .collection('corps')
      .doc(String(corporationId))
      .update({ [READERS_EPOCH_FIELD]: FieldValue.increment(1) });
  return { written, left };
}

/** Clears one marker entry, unless it was marked again since the drain read it. */
async function clearEntry(db: Firestore, ref: DocumentReference, entry: Entry): Promise<boolean> {
  return db.runTransaction(async (tx) => {
    const now = (await tx.get(ref)).get(new FieldPath(entry.kind, entry.id)) as unknown;
    if (now !== entry.nonce) return false;
    tx.update(ref, new FieldPath(entry.kind, entry.id), FieldValue.delete());
    return true;
  });
}

/** `drainReaders`, never thrown into the action, sync or job that ran it. */
export async function drainReadersSafely(
  db: Firestore,
  corporationId: number,
  budget?: number
): Promise<void> {
  await drainReaders(db, corporationId, budget).catch((e) =>
    console.error('readers drain failed', e instanceof Error ? e.message : e)
  );
}
