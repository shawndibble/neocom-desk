import type { BoardExtractionSource } from '../corp/board';
import {
  officerLabelsOf,
  refineryLabeler,
  structureNamesOf,
  type StoredRefineryLabel,
  type StoredRefineryStructure,
} from './refinery';
import { extractionId, type SyncExtraction } from './sync';

export interface FeederChunkBook {
  extractions: readonly SyncExtraction[];
  feeders: readonly {
    refineryLabels?: Readonly<Record<string, StoredRefineryLabel>>;
    refineryStructures?: Readonly<Record<string, StoredRefineryStructure>>;
  }[];
}

export interface FeederChunksInput {
  books: readonly FeederChunkBook[];
  skip: ReadonlySet<number>;
  now: number;
}

function bookLabeler(book: FeederChunkBook): (structureId: number) => string {
  const labels = officerLabelsOf(book.feeders);
  const names = structureNamesOf(book.feeders);
  const moons = new Map(book.extractions.map((x) => [x.structureId, x.moonId]));
  return refineryLabeler({
    officerLabels: (id) => labels.get(id),
    structureName: (id) => names.get(id),
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
