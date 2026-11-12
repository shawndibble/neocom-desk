/**
 * Collector books' Feeder Extractions as moon-chunk board sources, per Feeder corporation
 * (#6116), so the Calendar, Due soon and the Moon extractions widget show pops a pilot's
 * Characters cannot read from ESI themselves. A book's own chunks (no `sourceCorporationId`)
 * are left out: its officers read those from ESI already. A corporation in `skip` is one some
 * Character reads straight from ESI, which is fresher, so the book's copy is dropped and no pop
 * shows twice. Only live chunks count (not cancelled, not yet decayed), so a Feeder whose pops
 * are all past adds nothing.
 */
import type { BoardExtractionSource } from '../corp/board';
import {
  officerLabelsOf,
  refineryLabeler,
  structureNamesOf,
  type StoredRefineryLabel,
  type StoredRefineryStructure,
} from './refinery';
import { extractionId, type SyncExtraction } from './sync';

/** One book's Extractions and the Feeder records that name its refineries. */
export interface FeederChunkBook {
  extractions: readonly SyncExtraction[];
  feeders: readonly {
    refineryLabels?: Readonly<Record<string, StoredRefineryLabel>>;
    refineryStructures?: Readonly<Record<string, StoredRefineryStructure>>;
  }[];
}

export interface FeederChunksInput {
  books: readonly FeederChunkBook[];
  /** Corporations some Character reads from ESI. */
  skip: ReadonlySet<number>;
  /** Epoch ms: a chunk that has decayed by now is past. */
  now: number;
}

/** A book's refinery names: its own officers' labels, then the names its Feeder grants read. */
function bookLabeler(book: FeederChunkBook): (structureId: number) => string {
  const labels = officerLabelsOf(book.feeders);
  const names = structureNamesOf(book.feeders);
  const moons = new Map(book.extractions.map((x) => [x.structureId, x.moonId]));
  return refineryLabeler({
    officerLabels: (id) => labels.get(id),
    structureName: (id) => names.get(id),
    // ESI's own extraction rows read the same way when the refinery has no name.
    fallback: (id) => `Moon ${moons.get(id) ?? id}`,
  });
}

export function feederChunksByCorporation(
  input: FeederChunksInput
): Map<number, BoardExtractionSource[]> {
  const out = new Map<number, BoardExtractionSource[]>();
  const seen = new Set<string>();
  for (const book of input.books) {
    const label = bookLabeler(book);
    for (const x of book.extractions) {
      const owner = x.sourceCorporationId;
      if (owner === undefined || x.cancelledAt || input.skip.has(owner)) continue;
      const id = extractionId(x);
      if (seen.has(id)) continue;
      const chunkArrivalMs = Date.parse(x.chunkArrivalTime);
      const naturalDecayMs = Date.parse(x.naturalDecayTime);
      if (!Number.isFinite(chunkArrivalMs) || !Number.isFinite(naturalDecayMs)) continue;
      if (naturalDecayMs <= input.now) continue;
      seen.add(id);
      const list = out.get(owner) ?? [];
      list.push({
        structureId: x.structureId,
        subject: label(x.structureId),
        chunkArrivalMs,
        naturalDecayMs,
      });
      out.set(owner, list);
    }
  }
  return out;
}
