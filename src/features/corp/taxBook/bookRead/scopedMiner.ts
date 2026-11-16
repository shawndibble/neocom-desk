/**
 * One Miner's page from the read models (issue #5258, ADR 0032): the Miner's totals doc, their
 * Statements, payments, write-offs, adjustments and declarations by Miner, and the ledger rows
 * since the newest Statement began. Never the whole ledger. Every other field of its slices
 * (dismissals, Extractions, feeders, disputes, ...) is the whole book's, read as `slices.ts` reads it.
 * A missing composite index (observed: characterId + date) falls back to the Miner's characters'
 * whole ledger, filtered here, so an undeployed index costs reads, not the page.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit as limitTo,
  orderBy,
  query,
  where,
} from 'firebase/firestore/lite';
import type { RecordedWriteOff } from '@/engine/corpTaxBook/allocation';
import type { Miner } from '@/engine/corpTaxBook/charges';
import {
  minerScopedRows,
  openWindowStart,
  type HeaderTotals,
} from '@/engine/corpTaxBook/minerScope';
import type { Adjustment, Statement } from '@/engine/corpTaxBook/statements';
import type { SettlePayment } from '@/engine/corpTaxBook/sync';
import type { ObservedRow } from '@/engine/corpTaxBook/types';
import { settingsFrom, type BookDeclaration } from '../bookClient';
import { ALL_BOOK_PARTS, type BookPart, type BookPartSet } from './parts';
import { bookOf, readSlices, type BookRead, type ReadContext } from './slices';

const IN_LIMIT = 30;
const codeOf = (error: unknown) => String((error as { code?: unknown } | null)?.code ?? '');
const isMissingIndex = (error: unknown) => codeOf(error).endsWith('failed-precondition');

/** A one-Miner read: every whole-book slice, scoped to `minerId`, and any other asked. */
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
  // The totals doc may not be deployed or readable yet: no reason to lose the page.
  // A refusal is not that, and neither is a failed grouping read (the Miner would vanish).
  const totalsOrNone = async () => {
    try {
      return (await one('minerTotals')) as HeaderTotals | undefined;
    } catch (error) {
      if (codeOf(error).endsWith('permission-denied')) throw error;
      return undefined;
    }
  };
  const grouping = one('miners');
  const statements = byMiner<Statement>('statements');
  const characterIds = grouping.then((g) => {
    const solo = /^solo:(\d+)$/.exec(minerId);
    return Array.isArray(g?.characterIds)
      ? (g.characterIds as number[])
      : solo
        ? [Number(solo[1])]
        : [];
  });
  const from = statements.then((s) => openWindowStart(s, settingsFrom(book.data).startDate));

  const windowRows = async (ids: readonly number[], since: string): Promise<ObservedRow[]> => {
    const rows: ObservedRow[] = [];
    for (let i = 0; i < ids.length; i += IN_LIMIT) {
      const chunk = ids.slice(i, i + IN_LIMIT);
      try {
        const snap = await getDocs(
          query(under('observed'), where('characterId', 'in', chunk), where('date', '>=', since))
        );
        rows.push(...snap.docs.map((d) => d.data() as ObservedRow));
      } catch (error) {
        if (!isMissingIndex(error)) throw error;
        const snap = await getDocs(query(under('observed'), where('characterId', 'in', chunk)));
        rows.push(...snap.docs.map((d) => d.data() as ObservedRow).filter((r) => r.date >= since));
      }
    }
    return rows;
  };
  /** The corporation a character's newest ledger row was recorded under: member, leaver or guest. */
  const latestCorp = async (id: number, known: readonly ObservedRow[]) => {
    const mine = known.filter((r) => r.characterId === id);
    if (mine.length > 0)
      return mine.reduce((a, b) => (b.date >= a.date ? b : a)).recordedCorporationId;
    try {
      const snap = await getDocs(
        query(
          under('observed'),
          where('characterId', '==', id),
          orderBy('date', 'desc'),
          limitTo(1)
        )
      );
      const newest = snap.docs[0]?.data() as ObservedRow | undefined;
      return newest?.recordedCorporationId ?? corporationId;
    } catch {
      return corporationId;
    }
  };
  const observed = async () => {
    const [ids, since, own] = await Promise.all([characterIds, from, statements]);
    const windowed = await windowRows(ids, since);
    const corps = new Map(
      await Promise.all(ids.map(async (id) => [id, await latestCorp(id, windowed)] as const))
    );
    return minerScopedRows(own, windowed, { corpFor: (id) => corps.get(id) ?? corporationId });
  };
  const declarations = async (): Promise<BookDeclaration[]> => {
    const ids = (await statements).map((s) => s.id);
    const out: BookDeclaration[] = [];
    for (let i = 0; i < ids.length; i += IN_LIMIT)
      out.push(
        ...(
          await getDocs(
            query(under('declarations'), where('statementId', 'in', ids.slice(i, i + IN_LIMIT)))
          )
        ).docs.map((d) => d.data() as BookDeclaration)
      );
    return out;
  };

  const parts = new Set<BookPart>([...ALL_BOOK_PARTS, ...asked]);
  const [fields, since, totals] = await Promise.all([
    readSlices(ctx, parts, {
      miners: async () => {
        const g = await grouping;
        return g ? [g as unknown as Miner] : [];
      },
      statements: () => statements,
      payments: () => byMiner<SettlePayment>('payments'),
      writeOffs: () => byMiner<RecordedWriteOff>('writeOffs'),
      adjustments: () => byMiner<Adjustment>('adjustments'),
      declarations,
      observed,
    }),
    from,
    totalsOrNone(),
  ]);
  return {
    ...(await bookOf(ctx, parts, fields)),
    scopedMiner: minerId,
    minerScope: { from: since, ...(totals ? { totals } : {}) },
  };
}
