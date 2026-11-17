/**
 * A refinery's page from its moon docs (issue #6348, ADR 0032): the book's records and every moon
 * doc the refinery has, with no ledger row read. The docs hold what each Extraction's window
 * mined and by whom, which is all the page shows of mining.
 */
import { moonDocUsable } from '@/engine/corpTaxBook/pullFigures';
import type { BookPartSet } from './parts';
import { errorCode } from '../openBook';
import { structureMoonDocs } from './scopedMoon';
import { readWhole, type BookRead, type ReadContext } from './slices';

/** The asked parts whole, plus the refinery's moon docs (a doc on another schema is left out). */
export async function readRefineryScope(
  ctx: ReadContext,
  structureId: number,
  asked: BookPartSet
): Promise<BookRead> {
  const [read, docs] = await Promise.all([
    readWhole(ctx, asked),
    // Docs that cannot be read leave the page with its records and no mining; only a refusal ends it.
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
