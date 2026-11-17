/**
 * The officer read of a Corp Tax Book for `/corp/moons` (issues #4063, #5248, ADR 0023, ADR 0032):
 * the parts a page asks for, whole or scoped to one Miner or one moon, and the parts a later
 * tab adds. A read's `parts` names exactly the parts it filled (`slices.ts`). Officer-only:
 * verify first. Reads go through this tab's copy and Dexie (bookCache.ts, ADR 0031).
 */
import { openBook } from '../openBook';
import { missingParts, type BookPart, type BookPartSet } from './parts';
import { readMinerScope } from './scopedMiner';
import { readMoonScope } from './scopedMoon';
import { readRefineryScope } from './scopedRefinery';
import { mergeReads, readContext, readWhole, type BookRead } from './slices';

export { bookPartsFor, holdsParts } from './parts';
export type { BookRead };

/**
 * The asked parts (`bookPartsFor`), null when the corporation has no book. `minerId` reads one
 * Miner's page (#5258), `extractionId` one moon's (#5716), which reads the whole book's parts

 * when its moon docs cannot stand in; `structureId` a refinery's (#6348), read from its moon docs
 * with no ledger rows. A scoped read may fill more parts than asked: those its
 * scope always reads.
 */
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

/**
 * `held` with the wanted parts it lacks read and laid over it; `held` itself when it has them
 * all (`holdsParts`), or when the book is gone. A scoped read always holds the parts its scope
 * reads its own way, so the ones it lacks are read whole. The settings stay `held`'s
 * (`mergeReads`).
 */
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
