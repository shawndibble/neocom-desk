import { moonDocUsable } from '@/engine/corpTaxBook/pullFigures';
import type { BookPartSet } from './parts';
import { errorCode } from '../openBook';
import { structureMoonDocs } from './scopedMoon';
import { readWhole, type BookRead, type ReadContext } from './slices';

export async function readRefineryScope(
  ctx: ReadContext,
  structureId: number,
  asked: BookPartSet
): Promise<BookRead> {
  const [read, docs] = await Promise.all([
    readWhole(ctx, asked),
    structureMoonDocs(ctx.book, ctx.corporationId, structureId).catch((error) => {
      if (errorCode(error).endsWith('permission-denied')) throw error;
      return [];
    }),
  ]);
  return {
    ...read,
    refinery: {
      structureId,
      docs: new Map(docs.filter(moonDocUsable).map((d) => [d.extractionId, d])),
    },
  };
}
