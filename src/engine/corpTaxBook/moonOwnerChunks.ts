/**
 * A Collector book's moon owners' Extractions as moon-chunk board sources, per moon owner
 * corporation (#6116), so the Calendar, Due soon and the Moon extractions widget show pops a
 * pilot's Characters cannot read from ESI themselves. The book's own chunks (no
 * `sourceCorporationId`) are left out: its officers read those from ESI already. A corporation
 * in `skip` is one some Character reads straight from ESI, which is fresher, so the book's copy
 * of it is dropped and no pop shows twice.
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

export interface MoonOwnerChunksInput {
  extractions: readonly SyncExtraction[];
  /** The book's moon owner records, for refinery labels and names. */
  feeders: readonly {
    refineryLabels?: Readonly<Record<string, StoredRefineryLabel>>;
    refineryStructures?: Readonly<Record<string, StoredRefineryStructure>>;
  }[];
  /** Corporations some Character reads from ESI. */
  skip: ReadonlySet<number>;
}

export function moonOwnerChunksByCorporation(
  input: MoonOwnerChunksInput
): Map<number, BoardExtractionSource[]> {
  const labels = officerLabelsOf(input.feeders);
  const names = structureNamesOf(input.feeders);
  const moons = new Map(input.extractions.map((x) => [x.structureId, x.moonId]));
  const label = refineryLabeler({
    officerLabels: (id) => labels.get(id),
    structureName: (id) => names.get(id),
    // ESI's own extraction rows read the same way when the refinery has no name.
    fallback: (id) => `Moon ${moons.get(id) ?? id}`,
  });
  const out = new Map<number, BoardExtractionSource[]>();
  const seen = new Set<string>();
  for (const x of input.extractions) {
    const owner = x.sourceCorporationId;
    if (owner === undefined || x.cancelledAt !== undefined || input.skip.has(owner)) continue;
    const id = extractionId(x);
    if (seen.has(id)) continue;
    const chunkArrivalMs = Date.parse(x.chunkArrivalTime);
    const naturalDecayMs = Date.parse(x.naturalDecayTime);
    if (!Number.isFinite(chunkArrivalMs) || !Number.isFinite(naturalDecayMs)) continue;
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
  return out;
}
