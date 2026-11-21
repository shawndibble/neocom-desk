/**
 * A moon page from the moon docs (issue #5716, ADR 0032): the book's records, the refinery's moon
 * docs, and the rows of the windows of the moon's cycles (pullFigures.ts) in place of the whole
 * ledger. When a doc the page needs is
 * missing, on another schema or unreadable, the page reads the whole book instead. A missing
 * composite index (observed: structureId + date) reads the window's days at every refinery and
 * filters here, so an undeployed index costs reads, not the page.
 */
import { collection, getDocs, query, where } from 'firebase/firestore/lite';
import { moonDocUsable, planMoonScope } from '@/engine/corpTaxBook/pullFigures';
import { extractionId as extractionIdOf } from '@/engine/corpTaxBook/sync';
import type { ObservedRow } from '@/engine/corpTaxBook/types';
import { readObservedRow } from '@/engine/corpTaxBook/observed';
import type { MoonDoc } from '../../../../../functions/src/corpTaxBookMoonDocs';
import { settingsFrom } from '../bookClient';
import { errorCode } from '../openBook';
import type { BookPart, BookPartSet } from './parts';
import {
  bookOf,
  readField,
  readSlices,
  readWhole,
  startReading,
  type BookRead,
  type ReadContext,
} from './slices';

/** The parts a moon page reads in its scope: the window's rows stand in for the ledger rows. */
const MOON_PARTS: readonly BookPart[] = ['core', 'observed', 'ledger'];

/** Every moon doc a refinery has, one per Extraction (the read is cached for the tab). */
export function structureMoonDocs(
  book: ReadContext['book'],
  corporationId: number,
  structureId: number
): Promise<MoonDoc[]> {
  return book.part(
    'moonDocs',
    async () =>
      (
        await getDocs(
          query(
            collection(book.db, 'corps', String(corporationId), 'moonDocs'),
            where('structureId', '==', structureId)
          )
        )
      ).docs.map((d) => {
        // The server's timestamp is not part of the figures, and a class instance does not clone into the copy.
        const fields = { ...d.data() };
        delete fields.updatedAt;
        return fields as unknown as MoonDoc;
      }),
    `moonDocs:s:${structureId}`
  );
}

/** A moon page's read: the scoped parts and any other asked, or the asked parts whole. */
export async function readMoonScope(
  ctx: ReadContext,
  extractionId: string,
  asked: BookPartSet
): Promise<BookRead> {
  const { book, corporationId } = ctx;
  const under = (name: string) => collection(book.db, 'corps', String(corporationId), name);
  const settings = settingsFrom(book.data);
  const whole = async () => ({ ...(await readWhole(ctx, asked)), forMoon: extractionId });
  // The records are read either way; only the rows wait on the docs.
  startReading(ctx, ['core', 'ledger']);
  const extractions = await readField(ctx, 'extractions');

  const shown = extractions.find((x) => extractionIdOf(x) === extractionId);
  const docList = shown
    ? await structureMoonDocs(book, corporationId, shown.structureId).catch((error) => {
        if (errorCode(error).endsWith('permission-denied')) throw error;
        return undefined;
      })
    : [];
  if (!docList) return whole();
  const docs = new Map(docList.filter(moonDocUsable).map((d) => [d.extractionId, d]));
  const scope = planMoonScope({
    extractionId,
    extractions,
    docs,
    expiryHours: settings.structureExpiryHours,
  });
  if (!scope.ok) return whole();

  const rowsOf = (snap: { docs: { data: () => unknown }[] }): ObservedRow[] =>
    snap.docs.flatMap((d) => readObservedRow(d.data() as Record<string, unknown>) ?? []);
  const windowRows = async (w: { structureId: number; from: string; to: string }) => {
    const days = [where('date', '>=', w.from), where('date', '<=', w.to)] as const;
    try {
      const snap = await getDocs(
        query(under('observed'), where('structureId', '==', w.structureId), ...days)
      );
      return rowsOf(snap);
    } catch (error) {
      if (!errorCode(error).endsWith('failed-precondition')) throw error;
      const snap = await getDocs(query(under('observed'), ...days));
      return rowsOf(snap).filter((r) => r.structureId === w.structureId);
    }
  };
  const parts = new Set<BookPart>([...MOON_PARTS, ...asked]);
  // Every other field is the whole book's. Deliberately so for the disputes: they name a Miner and
  // a day, not a refinery, and the list is stamp-gated and served from this tab's copy (bookCache).
  const fields = await readSlices(ctx, parts, {
    observed: async () => (await Promise.all(scope.rows.map(windowRows))).flat(),
  });
  return {
    ...(await bookOf(ctx, parts, fields)),
    forMoon: extractionId,
    moon: { docs, fromDocs: scope.fromDocs },
  };
}
