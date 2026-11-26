import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore/lite';
import type { Adjustment } from '@/engine/corpTaxBook/adjustments';
import { characterIdsOfMiner, type Miner } from '@/engine/corpTaxBook/charges';
import { noticesOfDocs } from '@/engine/corpTaxBook/lateNotices';
import { accountWindowStart } from '@/engine/corpTaxBook/minerScope';
import type { RecordedWriteOff } from '@/engine/corpTaxBook/payments';
import type { RunningAccountCheckpoint } from '../../../../../functions/src/corpTaxBookCheckpoint';
import { usableCheckpoint } from '@/engine/corpTaxBook/openSet/miners';
import { NOTICE_ID_FIELD } from '../../../../../functions/src/corpTaxBookLateNotice';
import type { SettlePayment } from '@/engine/corpTaxBook/sync';
import type { ObservedRow } from '@/engine/corpTaxBook/types';
import { readObservedRow } from '@/engine/corpTaxBook/observed';
import { chunk } from '@/lib/chunk';
import { readDisputes } from '@/engine/corpTaxBook/disputes';
import {
  LATE_NOTICES,
  RUNNING_ACCOUNTS,
} from '../../../../../functions/src/corpTaxBookVersionKeys';
import { bookDeclarationOf, settingsFrom, type BookDeclaration } from '../bookClient';
import { errorCode } from '../openBook';
import { ALL_BOOK_PARTS, type BookPart, type BookPartSet } from './parts';
import { bookOf, readSlices, type BookRead, type ReadContext } from './slices';

const IN_LIMIT = 30;
const isMissingIndex = (error: unknown) => errorCode(error).endsWith('failed-precondition');

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
  const checkpoint = (async () => {
    if (!book.written(RUNNING_ACCOUNTS)) return undefined;
    try {
      return (await one(RUNNING_ACCOUNTS))?.snapshot as RunningAccountCheckpoint | undefined;
    } catch {
      return undefined;
    }
  })();
  const grouping = one('miners');
  const notices = (
    book.written(LATE_NOTICES)
      ? byMiner<unknown>(LATE_NOTICES).catch(() => [])
      : Promise.resolve([])
  ).then(noticesOfDocs);
  const characterIds = grouping.then((g) =>
    characterIdsOfMiner(minerId, Array.isArray(g?.characterIds) ? [g as unknown as Miner] : [])
  );
  const fitting = Promise.all([checkpoint, characterIds]).then(([c, ids]) =>
    usableCheckpoint(c, ids)
  );
  const from = fitting.then((c) => accountWindowStart(c, settingsFrom(book.data).startDate));

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
        ).docs.map((d) => bookDeclarationOf(d.data()))
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
        const c = await fitting;
        return c ? [c] : [];
      },
      payments: () => byMiner<SettlePayment>('payments'),
      writeOffs: () => byMiner<RecordedWriteOff>('writeOffs'),
      adjustments: () => byMiner<Adjustment>('adjustments'),
      declarations,
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
