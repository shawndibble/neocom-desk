import { openBook } from '../openBook';
import { missingParts, type BookPart, type BookPartSet } from './parts';
import { readMinerScope } from './scopedMiner';
import { readMoonScope } from './scopedMoon';
import { readRefineryScope } from './scopedRefinery';
import { mergeReads, readContext, readWhole, type BookRead } from './slices';

export { bookPartsFor, holdsParts } from './parts';
export type { BookRead };

export async function readBook(
  characterId: number,
  corporationId: number,
  ask: {
    parts: ReadonlySet<BookPart>;
    minerId?: string;
    extractionId?: string;
    structureId?: number;
  }
): Promise<BookRead | null> {
  const book = await openBook(characterId, corporationId);
  if (!book) return null;
  const ctx = readContext(book, characterId, corporationId);
  if (ask.minerId !== undefined) return readMinerScope(ctx, ask.minerId, ask.parts);
  if (ask.extractionId !== undefined) return readMoonScope(ctx, ask.extractionId, ask.parts);
  if (ask.structureId !== undefined) return readRefineryScope(ctx, ask.structureId, ask.parts);
  return readWhole(ctx, ask.parts);
}

export async function extendBook(
  characterId: number,
  corporationId: number,
  held: BookRead,
  wanted: BookPartSet
): Promise<BookRead> {
  const missing = missingParts(wanted, held.parts);
  if (missing.size === 0) return held;
  const extra = await readBook(characterId, corporationId, { parts: missing });
  return extra ? mergeReads(held, extra) : held;
}
