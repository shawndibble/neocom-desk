/**
 * One Miner's page (issue #5258, ADR 0032): their late notices, payments, write-offs,
 * adjustments, disputes and declarations by Miner, their closed-through checkpoint, and the
 * ledger rows from it on (`accountWindowStart`). Never the whole ledger. Every other field of its
 * parts (dismissals, Extractions, feeders, ...) is the whole book's, read as `slices.ts` reads it.
 * A missing composite index (observed: characterId + date) falls back to the Miner's characters'
 * whole ledger, filtered here, so an undeployed index costs reads, not the page.
 */
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore/lite';
import type { Adjustment } from '@/engine/corpTaxBook/adjustments';
import type { Miner } from '@/engine/corpTaxBook/charges';
import { readLateNotices } from '@/engine/corpTaxBook/lateNotices';
import { accountWindowStart } from '@/engine/corpTaxBook/minerScope';
import type { RecordedWriteOff } from '@/engine/corpTaxBook/payments';
import type { RunningAccountCheckpoint } from '../../../../../functions/src/corpTaxBookCheckpoint';
import { NOTICE_ID_FIELD } from '../../../../../functions/src/corpTaxBookLateNotice';
import type { SettlePayment } from '@/engine/corpTaxBook/sync';
import type { ObservedRow } from '@/engine/corpTaxBook/types';
import { readObservedRow } from '@/engine/corpTaxBook/observed';
import { chunk } from '@/lib/chunk';
import { readDisputes } from '@/engine/corpTaxBook/disputes';
import { LATE_NOTICES, LEGACY_NOTICES, settingsFrom, type BookDeclaration } from '../bookClient';
import { errorCode } from '../openBook';
import { ALL_BOOK_PARTS, type BookPart, type BookPartSet } from './parts';
import { bookOf, readSlices, type BookRead, type ReadContext } from './slices';

/** Firestore's cap on an `in` filter's values. */
const IN_LIMIT = 30;
const isMissingIndex = (error: unknown) => errorCode(error).endsWith('failed-precondition');

/** A one-Miner read: every whole-book part, scoped to `minerId`, and any other part asked. */
export async function readMinerScope(
  ctx: ReadContext,
  minerId: string,
  asked: BookPartSet
): Promise<BookRead> {
  const { book, corporationId } = ctx;
  const { db } = book;
  const under = (name: string) => collection(db, 'corps', String(corporationId), name);
  const byMiner = async <T>(name: string): Promise<T[]> =>
    (await getDocs(query(under(name), where('minerId', '==', minerId)))).docs.map(
      (d) => d.data() as T
    );
  const one = async (name: string) => {
    const snap = await getDoc(doc(db, 'corps', String(corporationId), name, minerId));
    return snap.exists() ? (snap.data() as Record<string, unknown>) : undefined;
  };
  // Best effort: a server that keeps no checkpoints yet, or rules that predate them, read none.
  const checkpoint = (async () => {
    if (!book.written('accountCheckpoints')) return undefined;
    try {
      return (await one('accountCheckpoints')) as RunningAccountCheckpoint | undefined;
    } catch {
      return undefined;
    }
  })();
  const grouping = one('miners');
  const notices = Promise.all([
    book.written(LATE_NOTICES) ? byMiner<unknown>(LATE_NOTICES).catch(() => []) : [],
    byMiner<unknown>(LEGACY_NOTICES),
  ]).then(([current, legacy]) => readLateNotices(current, legacy));
  const characterIds = grouping.then((g) => {
    const solo = /^solo:(\d+)$/.exec(minerId);
    return Array.isArray(g?.characterIds)
      ? (g.characterIds as number[])
      : solo
        ? [Number(solo[1])]
        : [];
  });
  const from = checkpoint.then((c) => accountWindowStart(c, settingsFrom(book.data).startDate));

  const rowsOf = (snap: { docs: { data: () => unknown }[] }) =>
    snap.docs.flatMap((d) => readObservedRow(d.data() as Record<string, unknown>) ?? []);
  const windowRows = async (ids: readonly number[], since: string): Promise<ObservedRow[]> => {
    const rows: ObservedRow[] = [];
    for (const batch of chunk(ids, IN_LIMIT)) {
      try {
        const snap = await getDocs(
          query(under('observed'), where('characterId', 'in', batch), where('date', '>=', since))
        );
        rows.push(...rowsOf(snap));
      } catch (error) {
        if (!isMissingIndex(error)) throw error;
        const snap = await getDocs(query(under('observed'), where('characterId', 'in', batch)));
        rows.push(...rowsOf(snap).filter((r) => r.date >= since));
      }
    }
    return rows;
  };
  const observed = async () => {
    const [ids, since] = await Promise.all([characterIds, from]);
    return windowRows(ids, since);
  };
  const declarations = async (): Promise<BookDeclaration[]> => {
    const ids = (await notices).map((n) => n.id);
    const out: BookDeclaration[] = [];
    for (const batch of chunk(ids, IN_LIMIT))
      out.push(
        ...(
          await getDocs(query(under('declarations'), where(NOTICE_ID_FIELD, 'in', batch)))
        ).docs.map((d) => d.data() as BookDeclaration)
      );
    return out;
  };

  const parts = new Set<BookPart>([...ALL_BOOK_PARTS, ...asked]);
  const [fields, since] = await Promise.all([
    readSlices(ctx, parts, {
      miners: async () => {
        const g = await grouping;
        return g ? [g as unknown as Miner] : [];
      },
      notices: () => notices,
      checkpoints: async () => {
        const c = await checkpoint;
        return c ? [c] : [];
      },
      payments: () => byMiner<SettlePayment>('payments'),
      writeOffs: () => byMiner<RecordedWriteOff>('writeOffs'),
      adjustments: () => byMiner<Adjustment>('adjustments'),
      declarations,
      // Best effort, as the whole book reads them: rules that predate disputes still open the page.
      disputes: async () =>
        book.written('disputes')
          ? readDisputes(await byMiner<unknown>('disputes').catch(() => []))
          : [],
      observed,
    }),
    from,
  ]);
  return {
    ...(await bookOf(ctx, parts, fields)),
    scopedMiner: minerId,
    minerScope: { from: since },
  };
}
