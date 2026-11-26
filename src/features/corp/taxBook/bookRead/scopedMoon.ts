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

const MOON_PARTS: readonly BookPart[] = ['core', 'observed', 'ledger'];

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
        const fields = { ...d.data() };
        delete fields.updatedAt;
        return fields as unknown as MoonDoc;
      }),
    `moonDocs:s:${structureId}`
  );
}

export async function readMoonScope(
  ctx: ReadContext,
  extractionId: string,
  asked: BookPartSet
): Promise<BookRead> {
  const { book, corporationId } = ctx;
  const under = (name: string) => collection(book.db, 'corps', String(corporationId), name);
  const settings = settingsFrom(book.data);
  const whole = async () => ({ ...(await readWhole(ctx, asked)), forMoon: extractionId });
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
  const fields = await readSlices(ctx, parts, {
    observed: async () => (await Promise.all(scope.rows.map(windowRows))).flat(),
  });
  return {
    ...(await bookOf(ctx, parts, fields)),
    forMoon: extractionId,
    moon: { docs, fromDocs: scope.fromDocs },
  };
}
